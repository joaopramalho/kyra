import type OpenAI from "openai";
import type { DelegationCreatedEvent } from "openai/resources/live/live";
import { SidebandWS } from "openai/resources/live/sideband/ws";

import type { ReceptionistAgent } from "../agent";
import { LiveLatencyTracker, type LiveCallLatency } from "./latency";

type Turn = { role: "caller" | "receptionist"; text: string; endMs: number };

export type DelegationTiming = {
  delegationId: string;
  offsetMs: number;
  transcriptWaitMs: number;
  agentMs: number;
  totalMs: number;
  tools: string[];
  answer: string;
  failed: boolean;
};

export type LiveCallSummary = {
  sessionId: string;
  durationMs: number;
  /** Session length OpenAI bills for, when the session closed normally. */
  billedSeconds?: number;
  delegations: DelegationTiming[];
  closeReason?: string;
  /** What the caller heard: when the receptionist first spoke and the gap before each answer. */
  latency?: LiveCallLatency;
};

/** A finished stretch of speech by one side, numbered in call order. */
export type LiveCallTurn = { sequence: number; speaker: "caller" | "assistant"; text: string };

export type LiveCallTimeout = "silence_timeout" | "duration_limit";

export type LiveCallControllerOptions = {
  client: OpenAI;
  sessionId: string;
  agent: ReceptionistAgent;
  /** Spoken as soon as the call connects, so the caller doesn't have to speak first. */
  greeting?: string;
  /** Hang up after this long without either side speaking. */
  silenceTimeoutMs?: number;
  /** Hang up when the call runs this long. */
  maxDurationMs?: number;
  /** Audio is flowing: the session started. */
  onStarted?: () => void;
  onTurn?: (turn: LiveCallTurn) => void;
  onTimeout?: (reason: LiveCallTimeout) => void;
  onDelegation?: (timing: DelegationTiming) => void;
  onClose?: (summary: LiveCallSummary) => void;
};

// Commentary appends are capped at 500 tokens; a spoken answer is far shorter.
const MAX_ANSWER_CHARS = 1_200;
// The caller's last words can arrive just after the delegation event.
const TRANSCRIPT_WAIT_MS = 300;
const SIDEBAND_OPEN_TIMEOUT_MS = 4_000;
const GREETING_AUDIO_TIMEOUT_MS = 4_000;
const GREETING_EVENT_ID = "kyra_initial_greeting";
const FALLBACK_ANSWER = "Sorry, I couldn't check that just now. Offer to take a message so the team can follow up.";
type SidebandAudioEvents = {
  on(type: string, listener: (event: { start_ms?: number; end_ms?: number }) => void): unknown;
  off(type: string, listener: (event: { start_ms?: number; end_ms?: number }) => void): unknown;
};

export type LiveCallStartupFailureReason = "sideband_connection_failed" | "greeting_start_failed";

export class LiveCallStartupError extends Error {
  constructor(readonly reason: LiveCallStartupFailureReason, readonly errorCode?: string) {
    super(reason);
    this.name = "LiveCallStartupError";
  }
}

function safeProviderCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  const nested = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : undefined;
  const deeper = nested?.error && typeof nested.error === "object" ? nested.error as Record<string, unknown> : undefined;
  const code = record.code ?? nested?.code ?? deeper?.code;
  return typeof code === "string" && /^[a-z0-9_.-]{1,80}$/i.test(code) ? code : undefined;
}

/**
 * Holds the sideband connection for one GPT-Live session for the whole call and
 * answers every delegation with the receptionist agent.
 */
export class LiveCallController {
  private readonly startedAt = Date.now();
  private readonly turns: Turn[] = [];
  private readonly delegations: DelegationTiming[] = [];
  private readonly abort = new AbortController();
  private socket: SidebandWS | undefined;
  private transcriptWaiters: Array<{ offsetMs: number; resolve: () => void }> = [];
  private emittedTurns = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | undefined;
  private durationTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly latency = new LiveLatencyTracker();
  private ready = false;
  private greetingSent = false;
  private mediaStartedNotified = false;
  private startupFailureReject: ((error: LiveCallStartupError) => void) | undefined;

  constructor(private readonly options: LiveCallControllerOptions) {}

  async start(): Promise<void> {
    const socket = new SidebandWS(this.options.client, { session_id: this.options.sessionId });
    this.socket = socket;
    const startupFailure = new Promise<never>((_resolve, reject) => {
      this.startupFailureReject = (error) => reject(error);
    });
    socket.on("session.input_transcript.delta", (event) => {
      this.measure(() => this.latency.callerTranscript(event.start_ms, event.end_ms));
      this.appendTranscript("caller", event.delta, event.end_ms);
    });
    socket.on("session.output_transcript.delta", (event) => {
      this.measure(() => this.latency.receptionistTranscript(event.start_ms, event.end_ms));
      this.appendTranscript("receptionist", event.delta, event.end_ms);
    });
    // OpenAI reflects output audio to the sideband with timeline offsets, but
    // the SDK's sideband event types leave it out. The socket still emits it.
    const audioEvents = socket as unknown as SidebandAudioEvents;
    audioEvents.on("session.output_audio.delta", (event) => this.measure(() => this.latency.receptionistAudio(event.start_ms, event.end_ms)));
    socket.on("session.delegation.created", (event) => void this.handleDelegation(event));
    socket.on("session.closed", (event) => {
      if (!this.ready) {
        this.failStartup(this.greetingSent ? "greeting_start_failed" : "sideband_connection_failed");
        return;
      }
      this.finish(event.reason ?? undefined, event.usage?.seconds, true);
    });
    socket.on("error", (error) => {
      const reason = this.greetingSent ? "greeting_start_failed" : "sideband_connection_failed";
      const errorCode = safeProviderCode(error);
      if (!this.ready) this.failStartup(reason, errorCode);
      else console.error(JSON.stringify({ event: "live.sideband.error", operation: "sideband", sessionId: this.options.sessionId, reason, ...(errorCode ? { errorCode } : {}) }));
    });
    socket.on("close", () => {
      if (!this.ready) {
        this.failStartup(this.greetingSent ? "greeting_start_failed" : "sideband_connection_failed");
        return;
      }
      this.finish("sideband_closed");
    });
    socket.on("session.started", () => undefined);
    audioEvents.on("session.output_audio.delta", () => {
      if (this.mediaStartedNotified) return;
      this.mediaStartedNotified = true;
      this.options.onStarted?.();
    });

    try {
      await Promise.race([this.waitForSidebandOpen(socket), startupFailure]);
      console.info(JSON.stringify({ event: "live.sideband.open", sessionId: this.options.sessionId }));
      await Promise.race([this.waitForGreetingAudio(socket, startupFailure), startupFailure]);
      console.info(JSON.stringify({ event: "live.greeting.audio_started", sessionId: this.options.sessionId }));
      this.ready = true;
      this.startupFailureReject = undefined;
      this.resetSilenceTimer();
      if (this.options.maxDurationMs) {
        const remainingMs = Math.max(0, this.options.maxDurationMs - (Date.now() - this.startedAt));
        this.durationTimer = setTimeout(() => this.options.onTimeout?.("duration_limit"), remainingMs);
      }
    } catch (error) {
      const failure = error instanceof LiveCallStartupError
        ? error
        : new LiveCallStartupError(this.greetingSent ? "greeting_start_failed" : "sideband_connection_failed", safeProviderCode(error));
      this.abortStartup();
      throw failure;
    }
  }

  private async waitForSidebandOpen(socket: SidebandWS): Promise<void> {
    const stream = socket.stream({ maxBufferedEvents: 64 });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new LiveCallStartupError("sideband_connection_failed", "sideband_open_timeout")), SIDEBAND_OPEN_TIMEOUT_MS);
    });
    try {
      const opened = (async () => {
        for (;;) {
          const next = await stream.next();
          if (next.done) throw new LiveCallStartupError("sideband_connection_failed", "sideband_closed_before_open");
          if (next.value.type === "open" || next.value.type === "reconnected") return;
          if (next.value.type === "error") throw new LiveCallStartupError("sideband_connection_failed", safeProviderCode(next.value.error));
          if (next.value.type === "close") throw new LiveCallStartupError("sideband_connection_failed", `sideband_close_${next.value.code}`);
          if (next.value.type === "message" && next.value.message.type === "error") {
            throw new LiveCallStartupError("sideband_connection_failed", safeProviderCode(next.value.message.error));
          }
        }
      })();
      await Promise.race([opened, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
      void stream.return?.();
    }
  }

  private async waitForGreetingAudio(socket: SidebandWS, startupFailure: Promise<never>): Promise<void> {
    const greeting = this.options.greeting?.trim();
    if (!greeting) throw new LiveCallStartupError("greeting_start_failed", "greeting_missing");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAudio: (() => void) | undefined;
    const audio = new Promise<void>((resolve, reject) => {
      onAudio = () => resolve();
      timer = setTimeout(() => reject(new LiveCallStartupError("greeting_start_failed", "greeting_audio_timeout")), GREETING_AUDIO_TIMEOUT_MS);
      (socket as unknown as SidebandAudioEvents).on("session.output_audio.delta", onAudio);
      try {
        // Commentary is Live's speakable-context event. instructions.append
        // only adds context and does not make the model produce audio.
        this.greetingSent = true;
        socket.send({ type: "session.commentary.append", delegation_id: null, content: greeting, event_id: GREETING_EVENT_ID });
        console.info(JSON.stringify({ event: "live.greeting.sent", sessionId: this.options.sessionId, eventId: GREETING_EVENT_ID }));
      } catch (error) {
        reject(new LiveCallStartupError("greeting_start_failed", safeProviderCode(error)));
      }
    });
    try {
      await Promise.race([audio, startupFailure]);
    } finally {
      if (timer) clearTimeout(timer);
      if (onAudio) (socket as unknown as SidebandAudioEvents).off("session.output_audio.delta", onAudio);
    }
  }

  private failStartup(reason: LiveCallStartupFailureReason, errorCode?: string): void {
    this.startupFailureReject?.(new LiveCallStartupError(reason, errorCode));
  }

  /** Tear down a failed startup without racing Admin's setup_failed finalization. */
  private abortStartup(): void {
    if (this.finished) return;
    this.finished = true;
    this.abort.abort();
    clearTimeout(this.silenceTimer);
    clearTimeout(this.durationTimer);
    this.socket?.close({ code: 1000, reason: "voice startup failed" });
  }

  /** The HTTP attach owner timed out or disconnected while startup was pending. */
  cancelStartup(): void {
    if (this.ready) {
      this.finish("sideband_closed");
      return;
    }
    this.failStartup("sideband_connection_failed", "attach_request_cancelled");
  }

  // Latency is telemetry: a failure here must never affect the call.
  private measure(record: () => void): void {
    try {
      record();
    } catch {
      // Ignore.
    }
  }

  /** Stops handling the call and ends its session. Resolves once OpenAI has been asked to hang up. */
  close(): Promise<void> {
    this.finish("sideband_closed");
    return this.sessionEnded;
  }

  /** Ends the whole session, which hangs up a browser call. OpenAI answers with session.closed. */
  endSession(): void {
    this.socket?.send({ type: "session.close" });
  }

  private resetSilenceTimer(): void {
    if (!this.options.silenceTimeoutMs || this.finished) return;
    clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => this.options.onTimeout?.("silence_timeout"), this.options.silenceTimeoutMs);
  }

  // Report every turn except the one still in progress.
  private emitFinishedTurns(includeLast: boolean): void {
    const ready = includeLast ? this.turns.length : this.turns.length - 1;
    for (; this.emittedTurns < ready; this.emittedTurns += 1) {
      const turn = this.turns[this.emittedTurns]!;
      this.options.onTurn?.({ sequence: this.emittedTurns + 1, speaker: turn.role === "caller" ? "caller" : "assistant", text: turn.text });
    }
  }

  private appendTranscript(role: Turn["role"], delta: string, endMs: number): void {
    this.resetSilenceTimer();
    const last = this.turns.at(-1);
    if (last?.role === role) {
      last.text += delta;
      last.endMs = endMs;
    } else {
      this.turns.push({ role, text: delta, endMs });
      this.emitFinishedTurns(false);
    }
    if (role !== "caller") return;
    this.transcriptWaiters = this.transcriptWaiters.filter((waiter) => {
      if (endMs < waiter.offsetMs) return true;
      waiter.resolve();
      return false;
    });
  }

  private async waitForCallerTranscript(offsetMs: number): Promise<void> {
    const lastCaller = [...this.turns].reverse().find((turn) => turn.role === "caller");
    if (lastCaller && lastCaller.endMs >= offsetMs) return;
    await new Promise<void>((resolve) => {
      const waiter = { offsetMs, resolve };
      this.transcriptWaiters.push(waiter);
      setTimeout(() => {
        this.transcriptWaiters = this.transcriptWaiters.filter((item) => item !== waiter);
        resolve();
      }, TRANSCRIPT_WAIT_MS);
    });
  }

  private conversationText(): string {
    return this.turns.map((turn) => `${turn.role === "caller" ? "Caller" : "Receptionist"}: ${turn.text.trim()}`).join("\n");
  }

  private delegationPrompt(): string {
    // The spoken transcript can lag or omit earlier answers, so list them
    // explicitly; otherwise the agent re-answers requests it already handled.
    const earlier = this.delegations.filter((item) => !item.failed).map((item) => `- ${item.answer}`);
    return [
      `Conversation so far:\n${this.conversationText()}`,
      earlier.length ? `Answers you already gave in this call:\n${earlier.join("\n")}` : "",
      "The voice model handed you the caller's most recent request. Handle only that request; earlier requests are already answered. Reply with what the receptionist should say next.",
    ].filter(Boolean).join("\n\n");
  }

  private async handleDelegation(event: DelegationCreatedEvent): Promise<void> {
    const delegationId = event.delegation.id;
    const receivedAt = performance.now();
    await this.waitForCallerTranscript(event.offset_ms);
    const transcriptReadyAt = performance.now();

    let answer = FALLBACK_ANSWER;
    let tools: string[] = [];
    let failed = false;
    try {
      const result = await this.options.agent.generate({
        prompt: this.delegationPrompt(),
        abortSignal: this.abort.signal,
      });
      tools = result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName));
      if (result.text.trim()) answer = result.text.trim().slice(0, MAX_ANSWER_CHARS);
    } catch (error) {
      failed = true;
      if (this.abort.signal.aborted) return;
      const errorCode = safeProviderCode(error);
      console.error(JSON.stringify({ event: "live.delegation.failed", operation: "agent_generate", sessionId: this.options.sessionId, delegationId, ...(errorCode ? { errorCode } : {}) }));
    }
    const answeredAt = performance.now();

    this.socket?.send({ type: "session.commentary.append", delegation_id: delegationId, content: answer, event_id: `answer_${delegationId}` });

    const timing: DelegationTiming = {
      delegationId,
      offsetMs: event.offset_ms,
      transcriptWaitMs: Math.round(transcriptReadyAt - receivedAt),
      agentMs: Math.round(answeredAt - transcriptReadyAt),
      totalMs: Math.round(answeredAt - receivedAt),
      tools,
      answer,
      failed,
    };
    this.delegations.push(timing);
    this.options.onDelegation?.(timing);
  }

  private finished = false;
  private sessionEnded: Promise<void> = Promise.resolve();

  private finish(closeReason?: string, billedSeconds?: number, sessionClosed = false): void {
    if (this.finished) return;
    this.finished = true;
    // Without the sideband nobody answers delegations, so end the session
    // rather than leave the caller talking to it while OpenAI keeps billing.
    if (!sessionClosed) this.sessionEnded = this.options.client.live.sessions.hangup(this.options.sessionId).then(() => undefined, () => undefined);
    clearTimeout(this.silenceTimer);
    clearTimeout(this.durationTimer);
    this.abort.abort();
    this.socket?.close({ code: 1000, reason: "session finished" });
    this.emitFinishedTurns(true);
    let latency: LiveCallLatency | undefined;
    this.measure(() => { latency = this.latency.summarize(); });
    this.options.onClose?.({
      sessionId: this.options.sessionId,
      durationMs: Date.now() - this.startedAt,
      delegations: this.delegations,
      ...(billedSeconds !== undefined ? { billedSeconds } : {}),
      ...(closeReason ? { closeReason } : {}),
      ...(latency ? { latency } : {}),
    });
  }
}
