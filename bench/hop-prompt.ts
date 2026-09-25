import { type State } from "../src/contract.js";
import { resolveQuestions } from "../src/packs/cursor.js";
import type { Fixture } from "./load-fixtures.js";

export const HOP_SYSTEM_PROMPT =
  "Think step by step about the decision, then return only JSON answers for the questions. Do not call any tool. Do not use decide.";

export function hopUserPayload(fixture: Fixture): {
  state: Fixture["state"];
  questions: ReturnType<typeof resolveQuestions>;
} {
  return {
    state: fixture.state,
    questions: resolveQuestions(fixture.state as State, fixture.preset, undefined)
  };
}

export function hopUserPrompt(fixture: Fixture): string {
  return `[${fixture.id}]\n${JSON.stringify(hopUserPayload(fixture), null, 2)}`;
}
