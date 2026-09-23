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
      { key: "yes", label: "yes", description: "yes" },
      { key: "no", label: "no", description: "no" }
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
    label: String(i),
    description
  }));
}

export function buildPrompt(stateText: string, question: Question, options: OptionSpec[]): string {
  const lines = options.map((opt) => `${opt.label} - ${opt.description}`);
  return [
    "State:",
    stateText,
    "",
    "Question:",
    question.instructions,
    "",
    "Options (answer with exactly one label token):",
    ...lines,
    "",
    "Answer:"
  ].join("\n");
}

export function statePrefix(state: unknown): string {
  return `State:\n${typeof state === "string" ? state : renderState(state as never)}\n\n`;
}
