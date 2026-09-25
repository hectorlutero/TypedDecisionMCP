import { homedir } from "node:os";
import { basename, join } from "node:path";
import { envFirst } from "./env.js";

export type ModelTier = "0.6B" | "1.7B" | "4B";

export type ModelSpec = {
  file: string;
  repo: string;
  url: string;
  sha256: string;
};

/** Ship default: MiniLM embedding GGUF for head-mlp. */
export const DEFAULT_MODEL_SPEC: ModelSpec = {
  file: "all-MiniLM-L6-v2-Q8_0.gguf",
  repo: "second-state/All-MiniLM-L6-v2-Embedding-GGUF",
  url: "https://huggingface.co/second-state/All-MiniLM-L6-v2-Embedding-GGUF/resolve/main/all-MiniLM-L6-v2-Q8_0.gguf",
  sha256: "263215c3cadd6e16740741a7624ab4cbb6c8e777688bd5331ecfbf5681c2f8ed"
};

/** Qwen logits / override tiers via DECIDE_TIER. */
export const MODEL_CATALOG: Record<ModelTier, ModelSpec> = {
  "0.6B": {
    file: "Qwen3-0.6B-Q8_0.gguf",
    repo: "unsloth/Qwen3-0.6B-GGUF",
    url: "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf",
    sha256: "e150ed544dfe6016930c026a93913a5e3184181ebfe6ab2223ae01dd0491784c"
  },
  "1.7B": {
    file: "Qwen3-1.7B-Q4_K_M.gguf",
    repo: "unsloth/Qwen3-1.7B-GGUF",
    url: "https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf",
    sha256: "b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897"
  },
  "4B": {
    file: "Qwen3-4B-Q4_K_M.gguf",
    repo: "unsloth/Qwen3-4B-GGUF",
    url: "https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf",
    sha256: "f6f851777709861056efcdad3af01da38b31223a3ba26e61a4f8bf3a2195813a"
  }
};

export function resolveTier(env: NodeJS.ProcessEnv = process.env): ModelTier {
  const raw = envFirst(env, "DECIDE_TIER", "DECIDIR_TIER") ?? "0.6B";
  if (raw === "0.6B" || raw === "1.7B" || raw === "4B") return raw;
  throw new Error(`DECIDE_TIER must be 0.6B, 1.7B, or 4B (got ${raw})`);
}

export function activeSpec(env: NodeJS.ProcessEnv = process.env): ModelSpec {
  if (envFirst(env, "DECIDE_TIER", "DECIDIR_TIER")) {
    return MODEL_CATALOG[resolveTier(env)];
  }
  return DEFAULT_MODEL_SPEC;
}

/** @deprecated prefer resolveModelPath / activeSpec */
export const MODEL_FILE = DEFAULT_MODEL_SPEC.file;
/** @deprecated prefer activeSpec */
export const MODEL_REPO = DEFAULT_MODEL_SPEC.repo;
/** @deprecated prefer activeSpec */
export const MODEL_URL = DEFAULT_MODEL_SPEC.url;
/** @deprecated prefer activeSpec */
export const MODEL_SHA256 = DEFAULT_MODEL_SPEC.sha256;
/** @deprecated prefer modelId() */
export const MODEL_ID = `${DEFAULT_MODEL_SPEC.repo}/${DEFAULT_MODEL_SPEC.file}`;

export function modelId(env: NodeJS.ProcessEnv = process.env): string {
  const override = envFirst(env, "DECIDE_MODEL_ID", "DECIDIR_MODEL_ID");
  if (override) return override;
  const model = envFirst(env, "DECIDE_MODEL", "DECIDIR_MODEL");
  if (model) {
    const base = basename(model);
    if (base.startsWith("all-MiniLM-L6-v2")) {
      return `second-state/All-MiniLM-L6-v2-Embedding-GGUF/${base}`;
    }
  }
  const spec = activeSpec(env);
  return `${spec.repo}/${spec.file}`;
}

export function resolveModelPath(env: NodeJS.ProcessEnv = process.env): string {
  const model = envFirst(env, "DECIDE_MODEL", "DECIDIR_MODEL");
  if (model) return model;
  return join(homedir(), ".cache", "TypedDecisionMCP", activeSpec(env).file);
}

/** @deprecated prefer resolveModelPath */
export function defaultModelPath(): string {
  return resolveModelPath();
}
