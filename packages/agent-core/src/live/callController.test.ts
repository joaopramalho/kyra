import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sockets = vi.hoisted(() => [] as Array<EventEmitter & { sent: unknown[]; send: (event: unknown) => void; close: () => void; stream: () => AsyncGenerator<{ type: string }> }>);
const behavior = vi.hoisted(() => ({ autoAudio: true, openFailure: false }));

vi.mock("openai/resources/live/sideband/ws", () => ({
  SidebandWS: class extends EventEmitter {
    sent: unknown[] = [];
    constructor() {
      super();
      sockets.push(this as never);
    }
    send(event: unknown) {
      this.sent.push(event);
      if (behavior.autoAudio && (event as { type?: string }).type === "session.commentary.append") {
        this.emit("session.output_audio.delta", { delta: "audio" });
      }
    }
    close() { /* the fake has no connection */ }
    async *stream() {
      if (behavior.openFailure) throw Object.assign(new Error("private transport text"), { code: "socket_unavailable" });
      yield { type: "open" };
      await new Promise<void>(() => undefined);
    }
  },
}));

import { LiveCallController, LiveCallStartupError, type LiveCallSummary, type LiveCallTurn } from "./callController";

function createController(options: { silenceTimeoutMs?: number } = {}) {
  const generate = vi.fn(async () => ({ text: "We're open until 5.", steps: [{ toolCalls: [{ toolName: "getBusinessHours" }] }] }));
  const turns: LiveCallTurn[] = [];
  const closed: LiveCallSummary[] = [];
  const onTimeout = vi.fn();
  const onStarted = vi.fn();
  const hangup = vi.fn(async () => undefined);
  const controller = new LiveCallController({
    client: { live: { sessions: { hangup } } } as never,
    sessionId: "live_1",
    agent: { generate } as never,
    greeting: "Thanks for calling Northside Plumbing.",
    ...options,
    onStarted,
    onTurn: (turn) => turns.push(turn),
    onTimeout,
    onClose: (summary) => closed.push(summary),
  });
  const start = controller.start();
  return { controller, socket: sockets.at(-1)!, start, generate, turns, closed, onTimeout, onStarted, hangup };
}

async function setup(options: { silenceTimeoutMs?: number } = {}) {
  const state = createController(options);
  await vi.waitFor(() => expect(state.socket.sent).toContainEqual(expect.objectContaining({ type: "session.commentary.append", event_id: "kyra_initial_greeting" })));
  if (behavior.autoAudio) await state.start;
  return state;
}

beforeEach(() => { sockets.length = 0; behavior.autoAudio = true; behavior.openFailure = false; });
afterEach(() => { vi.useRealTimers(); });

describe("LiveCallController startup and media", () => {
  it("sends one speakable greeting after sideband opens and reports readiness only on output audio", async () => {
    behavior.autoAudio = false;
    const state = createController();
    await vi.waitFor(() => expect(state.socket.sent).toContainEqual(expect.objectContaining({ type: "session.commentary.append", event_id: "kyra_initial_greeting", content: "Thanks for calling Northside Plumbing." })));
    expect(state.onStarted).not.toHaveBeenCalled();
    state.socket.emit("session.output_audio.delta", { delta: "first chunk" });
    await state.start;
    expect(state.onStarted).toHaveBeenCalledOnce();
    expect(state.socket.sent.filter((event) => (event as { event_id?: string }).event_id === "kyra_initial_greeting")).toHaveLength(1);
  });

  it("fails startup when sideband cannot connect and exposes no provider message", async () => {
    behavior.openFailure = true;
    const state = createController();
    await expect(state.start).rejects.toMatchObject({ name: "LiveCallStartupError", reason: "sideband_connection_failed", errorCode: "socket_unavailable" });
    expect(state.closed).toEqual([]);
    expect(state.hangup).not.toHaveBeenCalled();
  });

  it("fails startup if the model produces no greeting audio", async () => {
    vi.useFakeTimers();
    behavior.autoAudio = false;
    const state = createController();
    const startupResult = state.start.then(() => undefined, (error: unknown) => error);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(4_001);
    expect(await startupResult).toBeInstanceOf(LiveCallStartupError);
    expect(state.onStarted).not.toHaveBeenCalled();
    expect(state.closed).toEqual([]);
  });

  it("answers a delegation with the agent's reply", async () => {
    const { socket, generate } = await setup();
    socket.emit("session.input_transcript.delta", { delta: "Are you open today?", end_ms: 1_000 });
    socket.emit("session.delegation.created", { delegation: { id: "item_1" }, offset_ms: 900 });
    await vi.waitFor(() => expect(socket.sent).toContainEqual(expect.objectContaining({ type: "session.commentary.append", delegation_id: "item_1", content: "We're open until 5." })));
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringContaining("Caller: Are you open today?") }));
  });

  it("reports finished turns in order and billed seconds on close", async () => {
    const { socket, turns, closed } = await setup();
    socket.emit("session.output_transcript.delta", { delta: "Thanks for calling.", end_ms: 500 });
    socket.emit("session.input_transcript.delta", { delta: "Hi, ", end_ms: 1_000 });
    socket.emit("session.input_transcript.delta", { delta: "are you open?", end_ms: 1_500 });
    expect(turns).toEqual([{ sequence: 1, speaker: "assistant", text: "Thanks for calling." }]);
    socket.emit("session.closed", { reason: "remote_hangup", usage: { seconds: 42 } });
    expect(turns.at(-1)).toEqual({ sequence: 2, speaker: "caller", text: "Hi, are you open?" });
    expect(closed).toEqual([expect.objectContaining({ billedSeconds: 42, closeReason: "remote_hangup" })]);
  });

  it("reports what the caller heard from sideband audio timeline on close", async () => {
    const { socket, closed } = await setup();
    socket.emit("session.output_audio.delta", { delta: "", start_ms: 1_100, end_ms: 2_000 });
    socket.emit("session.output_transcript.delta", { delta: "Thanks for calling.", start_ms: 1_150, end_ms: 1_900 });
    socket.emit("session.input_transcript.delta", { delta: "Are you open today?", start_ms: 3_000, end_ms: 4_200 });
    socket.emit("session.output_audio.delta", { delta: "", start_ms: 5_000, end_ms: 6_000 });
    socket.emit("session.output_transcript.delta", { delta: "Yes, until 5.", start_ms: 5_050, end_ms: 5_900 });
    socket.emit("session.closed", { reason: "remote_hangup" });
    expect(closed[0]?.latency).toEqual({ firstSpeechMs: 1_100, greetedFirst: true, answerGapsMs: [800], speechSource: "audio" });
  });

  it("hangs up and finalizes when the sideband drops mid-call", async () => {
    const { socket, closed, hangup } = await setup();
    socket.emit("close");
    expect(hangup).toHaveBeenCalledWith("live_1");
    expect(closed).toEqual([expect.objectContaining({ closeReason: "sideband_closed" })]);
  });

  it("times out after a stretch of silence", async () => {
    vi.useFakeTimers();
    const { socket, onTimeout } = await setup({ silenceTimeoutMs: 75_000 });
    await vi.advanceTimersByTimeAsync(60_000);
    socket.emit("session.input_transcript.delta", { delta: "Hello?", end_ms: 60_000 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(onTimeout).toHaveBeenCalledWith("silence_timeout");
  });
});
