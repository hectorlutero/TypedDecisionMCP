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
        "Este comando de shell é destrutivo (apaga, force-push, drop, overwrite irrecuperável)?"
    }
  },
  subagente: {
    subagente: {
      type: "choice",
      instructions: "Qual subagent_type do Cursor deve correr este pedido?",
      criteria: { ...SUBAGENTES }
    }
  },
  diff: {
    diff: {
      type: "yesno",
      instructions: "O diff cobre o pedido do utilizador, sem trabalho extra não pedido?"
    }
  },
  ficheiro: {
    ficheiro: {
      type: "choice",
      instructions: "Qual destes caminhos é o sítio certo para a mudança?",
      criteria: { _placeholder: "replaced at resolve time" }
    }
  },
  commit: {
    commit: {
      type: "score",
      instructions: "Quão pronto está este diff para commit?",
      criteria: ["falta teste", "review", "pronto"]
    }
  }
};

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
      instructions: "Qual destes caminhos é o sítio certo para a mudança?",
      criteria: Object.fromEntries(candidates.map((path) => [path, path]))
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
