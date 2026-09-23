import { DecideError } from "../contract.js";

export type Tokenizer = {
  tokenize(text: string): readonly number[];
};

export function optionTokenIds(tokenizer: Tokenizer, label: string): number[] {
  const ids: number[] = [];
  for (const text of [label, ` ${label}`]) {
    const tokens = tokenizer.tokenize(text) as readonly number[];
    if (tokens.length === 1 && tokens[0] !== undefined && !ids.includes(tokens[0])) {
      ids.push(tokens[0]);
    }
  }
  if (ids.length === 0) {
    throw new DecideError(
      "multi_token_option",
      `option label ${JSON.stringify(label)} is not a single token in the pinned tokenizer`
    );
  }
  return ids;
}

export function requireSingleToken(tokenizer: Tokenizer, label: string): number {
  return optionTokenIds(tokenizer, label)[0] ?? 0;
}
