/** Pinned ruler for the 10× token ratio. Same function on hop text and tool transcript. */
export const TOKENIZER_ID = "chars/4" as const;

export function countTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function transcriptTokens(answers: unknown): number {
  return countTokens(JSON.stringify(answers ?? {}));
}

export function hopTokens(text: string | undefined, uiOutputTokens: number): { tokens: number; ruler: "chars/4" | "ui" } {
  if (text && text.length > 0) return { tokens: countTokens(text), ruler: TOKENIZER_ID };
  return { tokens: Math.max(1, uiOutputTokens), ruler: "ui" };
}
