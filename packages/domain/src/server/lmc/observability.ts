import type { LmcStructuredAction } from "@lobbystack/contracts";

type LmcActionSummary = {
  actionTypes: LmcStructuredAction["type"][];
  confidence?: number;
  intent?: Extract<LmcStructuredAction, { type: "intent" }>["intent"];
  handoffReason?: string;
};

export function summarizeLmcActions(actions: LmcStructuredAction[]): LmcActionSummary {
  const qualification = actions.find((action) => action.type === "qualify");
  const intent = actions.find((action) => action.type === "intent");
  const handoff = actions.find((action) => action.type === "handoff");

  return {
    actionTypes: actions.map((action) => action.type),
    ...(qualification?.type === "qualify" ? { confidence: qualification.confidence } : {}),
    ...(intent?.type === "intent" ? { intent: intent.intent } : {}),
    ...(handoff?.type === "handoff" ? { handoffReason: handoff.reason } : {}),
  };
}
