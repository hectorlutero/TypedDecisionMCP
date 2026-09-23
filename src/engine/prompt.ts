import { renderState, type Question } from "../contract.js";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export type OptionSpec = {
  key: string;
  label: string;
  description: string;
};

export function optionSpecs(question: Question): OptionSpec[] {
  if (question.type === "yesno") {
    return [
      { key: "yes", label: "A", description: question.options?.yes ?? "yes" },
      { key: "no", label: "B", description: question.options?.no ?? "no" }
    ];
  }
  if (question.type === "choice") {
    return Object.entries(question.criteria).map(([key, description], i) => ({
      key,
      label: LETTERS[i] ?? String(i),
      description: description ?? key
    }));
  }
  return question.criteria.map((description, i) => ({
    key: String(i),
    label: LETTERS[i] ?? String(i),
    description
  }));
}

export function buildPrompt(stateText: string, question: Question, options: OptionSpec[]): string {
  const lines = options.map((opt) => `${opt.label} - ${opt.description}`);
  return [
    "Classify the state. Reply with exactly one option label.",
    "",
    "State:",
    stateText,
    "",
    "Question:",
    question.instructions,
    "",
    "Options:",
    ...lines,
    "",
    "Reply with exactly one label."
  ].join("\n");
}

/** Qwen3 chat envelope with an empty think block so the next token is the label. */
export function wrapForModel(body: string): string {
  return [
    "<|im_start|>system",
    "You are a classifier. Reply with exactly one option label token. No punctuation. No explanation.",
    "<|im_end|>",
    "<|im_start|>user",
    body,
    "/no_think",
    "<|im_end|>",
    "<|im_start|>assistant",
    "<think>",
    "",
    "</think>",
    ""
  ].join("\n");
}

export function statePrefix(state: unknown): string {
  return `State:\n${typeof state === "string" ? state : renderState(state as never)}\n\n`;
}
