import {
  normalizePreset,
  parseDecideInput,
  type DecideInput,
  type DecideOutput,
  type Questions,
  type State
} from "./contract.js";
import { getLogitEngine, type DecisionEngine } from "./engine/logits.js";
import { resolveQuestions } from "./packs/cursor.js";
import { decideAction } from "./policy.js";

export async function decide(
  raw: unknown,
  engine?: DecisionEngine
): Promise<DecideOutput> {
  const input = parseDecideInput(raw);
  const questions = resolveQuestions(input.state, normalizePreset(input.preset), input.questions);
  const resolved = engine ?? (await getLogitEngine());
  const scored = await resolved.score(input.state, questions);
  const { action, reasons } = decideAction(scored.answers);
  return {
    engine: "logits",
    model: scored.model,
    answers: scored.answers,
    action,
    reasons,
    usage: scored.usage,
    latency_ms: scored.latency_ms
  };
}

export function previewQuestions(state: State, input: DecideInput): Questions {
  return resolveQuestions(state, normalizePreset(input.preset), input.questions);
}
