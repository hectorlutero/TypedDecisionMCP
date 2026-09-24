import {
  DecideError,
  extractCandidates,
  type Preset,
  type Questions,
  type State
} from "../contract.js";

const SUBAGENTES = {
  explore: "Search the codebase or answer a question without editing",
  generalPurpose: "Implement or change code across the repo",
  "ci-investigator": "Diagnose a failing CI check or test run",
  "cursor-guide": "Question about how Cursor itself works",
  "security-review": "Review a diff for security issues"
} as const;

export const PACKS: Record<Exclude<Preset, "pacote">, Questions> = {
  comando: {
    comando: {
      type: "yesno",
      instructions:
        "Is this shell command destructive (deletes data, formats a disk, force-push, drop, irrecoverable overwrite)?"
    }
  },
  subagente: {
    subagente: {
      type: "choice",
      instructions: "Which Cursor subagent_type should run this request?",
      criteria: { ...SUBAGENTES }
    }
  },
  diff: {
    diff: {
      type: "yesno",
      instructions: "Does this diff cover the user's request, with no extra unrequested work?"
    }
  },
  ficheiro: {
    ficheiro: {
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

function ficheiroQuestions(state: State): Questions {
  const candidates = extractCandidates(state);
  if (candidates.length < 2 || candidates.length > 20) {
    throw new DecideError(
      "invalid_request",
      "preset ficheiro requires state.candidates: string[] with 2 to 20 paths"
    );
  }
  return {
    ficheiro: {
      type: "choice",
      instructions: "Which of these paths is the right place for this change?",
      criteria: Object.fromEntries(candidates.map((path) => [path, roleForPath(path)]))
    }
  };
}

export function questionsForPreset(preset: Preset, state: State): Questions {
  if (preset === "ficheiro") return ficheiroQuestions(state);
  if (preset === "pacote") {
    return {
      ...PACKS.comando,
      ...PACKS.subagente,
      ...PACKS.diff,
      ...ficheiroQuestions(state),
      ...PACKS.commit
    };
  }
  return { ...PACKS[preset] };
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
