/** Pinned ruler for the 10× token ratio. Same function on hop text and tool transcript. */
export const TOKENIZER_ID = "chars/4" as const;

export function countTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Decision only: type + yes|choice|score. Drops probabilities, legend, confidence. */
export function compactDecisionAnswers(answers: unknown): Record<string, unknown> {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return {};
  const out: Record<string, unknown> = {};
  for (const [id, raw] of Object.entries(answers as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const answer = raw as Record<string, unknown>;
    if (answer.type === "yesno") {
      out[id] = { type: "yesno", yes: answer.yes };
    } else if (answer.type === "choice") {
      out[id] = { type: "choice", choice: answer.choice };
    } else if (answer.type === "score") {
      out[id] = { type: "score", score: answer.score };
    }
  }
  return out;
}

export function transcriptTokens(answers: unknown): number {
  return countTokens(JSON.stringify(compactDecisionAnswers(answers)));
}

export function hopTokens(text: string | undefined, uiOutputTokens: number): { tokens: number; ruler: "chars/4" | "ui" } {
  if (text && text.length > 0) return { tokens: countTokens(text), ruler: TOKENIZER_ID };
  return { tokens: Math.max(1, uiOutputTokens), ruler: "ui" };
}
