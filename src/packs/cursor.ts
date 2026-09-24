import {
  DecideError,
  extractCandidates,
  isRecord,
  normalizePreset,
  renderState,
  type CanonicalPreset,
  type Preset,
  type Question,
  type Questions,
  type State
} from "../contract.js";
import { optionSpecs } from "../engine/prompt.js";

const SUBAGENTS = {
  explore: "Search the codebase or answer a question without editing",
  generalPurpose: "Implement or change code across the repo",
  "ci-investigator": "Diagnose a failing CI check or test run",
  "cursor-guide": "Question about how Cursor itself works",
  "security-review": "Review a diff for security issues"
} as const;

export const PACKS: Record<Exclude<CanonicalPreset, "bundle">, Questions> = {
  command: {
    command: {
      type: "yesno",
      instructions:
        "Is this shell command destructive (deletes data, formats a disk, force-push, drop, irrecoverable overwrite)?"
    }
  },
  subagent: {
    subagent: {
      type: "choice",
      instructions: "Which Cursor subagent_type should run this request?",
      criteria: { ...SUBAGENTS }
    }
  },
  diff: {
    diff: {
      type: "yesno",
      instructions: "Does this diff cover the user's request, with no extra unrequested work?"
    }
  },
  file: {
    file: {
      type: "choice",
      instructions: "Which of these paths is the right place for this change?",
      criteria: { _placeholder: "replaced at resolve time" }
    }
  },
  commit: {
    commit: {
      type: "score",
      instructions: "How ready is this diff to commit? Pick the single best label.",
      criteria: [
        "missing tests — not ready",
        "needs review — tests exist but review is open",
        "ready to commit — tests and review are done"
      ]
    }
  }
};

export function roleForPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  if (base === "index.ts") return "process / stdio entrypoint";
  if (base === "policy.ts") return "auto / review / stop thresholds";
  if (base === "LICENSE") return "copyright / license holder";
  if (base === "http.ts") return "HTTP listen";
  if (base === "cursor.ts") return "preset copy";
  if (base === "report.ts") return "10x report math";
  if (base === "contract.ts") return "yesno / choice / score schema";
  if (base === "logits.ts") return "logit engine";
  if (path.includes("models/") || base === "README.md") return "GGUF fetch docs";
  if (base.endsWith(".mcp.json")) return "Cursor MCP example JSON";
  return base;
}

function fileQuestions(state: State): Questions {
  const candidates = extractCandidates(state);
  if (candidates.length < 2 || candidates.length > 20) {
    throw new DecideError(
      "invalid_request",
      "preset file requires state.candidates: string[] with 2 to 20 paths"
    );
  }
  return {
    file: {
      type: "choice",
      instructions: "Which of these paths is the right place for this change?",
      criteria: Object.fromEntries(candidates.map((path) => [path, roleForPath(path)]))
    }
  };
}

export function questionsForPreset(preset: Preset, state: State): Questions {
  const canonical = normalizePreset(preset);
  if (canonical === "file") return fileQuestions(state);
  if (canonical === "bundle") {
    return {
      ...PACKS.command,
      ...PACKS.subagent,
      ...PACKS.diff,
      ...fileQuestions(state),
      ...PACKS.commit
    };
  }
  return { ...PACKS[canonical] };
}

export function resolveQuestions(
  state: State,
  preset: Preset | undefined,
  extra: Questions | undefined
): Questions {
  const fromPreset = preset ? questionsForPreset(preset, state) : {};
  const merged = { ...fromPreset, ...(extra ?? {}) };
  if (Object.keys(merged).length === 0) {
    throw new DecideError("invalid_request", "preset or questions is required");
  }
  return merged;
}

function pickString(state: State, key: string): string | undefined {
  if (!isRecord(state)) return undefined;
  const value = state[key];
  return typeof value === "string" ? value : undefined;
}

const DIFF_VIEW_CHARS = 1800;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…`;
}

function viewForPreset(preset: CanonicalPreset, state: State): string {
  if (typeof state === "string") return state;
  if (preset === "command") {
    const view: Record<string, string> = {};
    const command = pickString(state, "command");
    const cwd = pickString(state, "cwd");
    if (command) view.command = command;
    if (cwd) view.cwd = cwd;
    return renderState(view);
  }
  if (preset === "diff") {
    const view: Record<string, string> = {};
    const request = pickString(state, "request");
    const diff = pickString(state, "diff");
    if (request) view.request = request;
    if (diff) view.diff = truncate(diff, DIFF_VIEW_CHARS);
    return renderState(view);
  }
  if (preset === "subagent") {
    const view: Record<string, string> = {};
    const request = pickString(state, "request") ?? pickString(state, "task");
    if (request) view.request = request;
    return renderState(view);
  }
  if (preset === "file") {
    const view: Record<string, unknown> = {};
    const request = pickString(state, "request");
    if (request) view.request = request;
    const candidates = extractCandidates(state);
    if (candidates.length) view.candidates = candidates;
    return renderState(view);
  }
  if (preset === "commit") {
    const view: Record<string, string> = {};
    const request = pickString(state, "request");
    const diff = pickString(state, "diff");
    const tests = pickString(state, "tests");
    const review = pickString(state, "review");
    if (request) view.request = request;
    if (diff) view.diff = truncate(diff, DIFF_VIEW_CHARS);
    if (tests) view.tests = tests;
    if (review) view.review = review;
    return renderState(view);
  }
  if (preset === "bundle") {
    const view: Record<string, unknown> = {};
    const command = pickString(state, "command");
    const cwd = pickString(state, "cwd");
    const request = pickString(state, "request") ?? pickString(state, "task");
    const diff = pickString(state, "diff");
    const tests = pickString(state, "tests");
    const review = pickString(state, "review");
    if (command) view.command = command;
    if (cwd) view.cwd = cwd;
    if (request) view.request = request;
    if (diff) view.diff = truncate(diff, DIFF_VIEW_CHARS);
    if (tests) view.tests = tests;
    if (review) view.review = review;
    const candidates = extractCandidates(state);
    if (candidates.length) view.candidates = candidates;
    return renderState(view);
  }
  return renderState(state);
}

export function resolvePack(
  state: State,
  preset: Preset | undefined,
  extra: Questions | undefined
): { questions: Questions; view: string } {
  const questions = resolveQuestions(state, preset, extra);
  const canonical = preset ? normalizePreset(preset) : undefined;
  const view = canonical ? viewForPreset(canonical, state) : renderState(state);
  return { questions, view };
}

/** Contrastive option shots from authored gold (cmd-03/05, sub-06/02). Labels follow optionSpecs. */
const FEW_SHOT: Array<{ id: string; state: State; question: Question; answerKey: string }> = [
  {
    id: "command",
    state: { command: "drop table users cascade;", cwd: "/repo" },
    question: PACKS.command.command,
    answerKey: "yes"
  },
  {
    id: "command",
    state: { command: "git status", cwd: "/repo" },
    question: PACKS.command.command,
    answerKey: "no"
  },
  {
    id: "subagent",
    state: { task: "Search the repo for all callers of decideAction. Read only." },
    question: PACKS.subagent.subagent,
    answerKey: "explore"
  },
  {
    id: "subagent",
    state: { task: "Implement the forgot-password endpoint and wire the route." },
    question: PACKS.subagent.subagent,
    answerKey: "generalPurpose"
  }
];

function answerLabel(question: Question, answerKey: string): string {
  const match = optionSpecs(question).find((opt) => opt.key === answerKey);
  if (!match) {
    throw new DecideError("invalid_request", `few-shot answerKey ${answerKey} is not an option`);
  }
  return match.label;
}

function formatOneShot(example: (typeof FEW_SHOT)[number]): string {
  const options = optionSpecs(example.question);
  const lines = options.map((opt) => `${opt.label} - ${opt.description}`);
  return [
    "Example:",
    "State:",
    renderState(example.state),
    "Question:",
    example.question.instructions,
    "Options:",
    ...lines,
    `Answer: ${answerLabel(example.question, example.answerKey)}`
  ].join("\n");
}

export function formatFewShot(questionIds: string[]): string {
  const wanted = new Set(questionIds);
  const blocks = FEW_SHOT.filter((example) => wanted.has(example.id)).map(formatOneShot);
  return blocks.length === 0 ? "" : ["Examples:", ...blocks].join("\n");
}
