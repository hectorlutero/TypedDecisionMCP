import type { Answers } from "../src/contract.js";
import type { Fixture } from "./load-fixtures.js";

export function predictedLabel(id: string, answers: Answers): string {
  const answer = answers[id];
  if (!answer) return "";
  if (answer.type === "yesno") return answer.yes >= 0.5 ? "yes" : "no";
  if (answer.type === "choice") return answer.choice;
  const nearest = Object.entries(answer.probabilities).sort((a, b) => b[1] - a[1])[0];
  return nearest?.[0] ?? String(Math.round(answer.score));
}

export function goldHits(fixture: Fixture, answers: Answers): { ok: number; n: number } {
  let ok = 0;
  let n = 0;
  for (const [id, label] of Object.entries(fixture.gold)) {
    n += 1;
    if (predictedLabel(id, answers) === label) ok += 1;
  }
  return { ok, n };
}
