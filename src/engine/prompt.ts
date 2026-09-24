import { renderState, type Question, type Questions } from "../contract.js";

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

export function promptPrefix(stateText: string): string {
  return ["Classify the state. Reply with exactly one option label.", "", "State:", stateText, "", ""].join("\n");
}

export function promptSuffix(question: Question, options: OptionSpec[]): string {
  const lines = options.map((opt) => `${opt.label} - ${opt.description}`);
  return ["Question:", question.instructions, "", "Options:", ...lines].join("\n");
}

export function buildPrompt(stateText: string, question: Question, options: OptionSpec[]): string {
  return promptPrefix(stateText) + promptSuffix(question, options);
}

const WRAP_HEAD = [
  "<|im_start|>system",
  "You are a classifier. Reply with exactly one option label token. No punctuation. No explanation.",
  "<|im_end|>",
  "<|im_start|>user",
  ""
].join("\n");

const WRAP_TAIL = ["", "/no_think", "<|im_end|>", "<|im_start|>assistant", "<think>", "", "</think>", ""].join("\n");

export function wrapPrefix(prefixBody: string): string {
  return WRAP_HEAD + prefixBody;
}

export function wrapSuffix(suffixBody: string): string {
  return suffixBody + WRAP_TAIL;
}

/** Qwen3 chat envelope with an empty think block so the next token is the label. */
export function wrapForModel(body: string): string {
  return wrapPrefix(body) + wrapSuffix("");
}

export type CompiledHops = {
  prefix: string;
  items: Record<string, { suffix: string; full: string }>;
};

export function compileHops(stateText: string, questions: Questions): CompiledHops {
  const prefix = wrapPrefix(promptPrefix(stateText));
  const items: CompiledHops["items"] = {};
  for (const [id, question] of Object.entries(questions)) {
    const suffix = wrapSuffix(promptSuffix(question, optionSpecs(question)));
    items[id] = { suffix, full: prefix + suffix };
  }
  return { prefix, items };
}

export function statePrefix(state: unknown): string {
  return `State:\n${typeof state === "string" ? state : renderState(state as never)}\n\n`;
}
