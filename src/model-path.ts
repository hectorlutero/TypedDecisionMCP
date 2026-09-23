import { homedir } from "node:os";
import { join } from "node:path";

export const MODEL_FILE = "Qwen3-0.6B-Q8_0.gguf";
export const MODEL_REPO = "unsloth/Qwen3-0.6B-GGUF";
export const MODEL_URL =
  "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf";
export const MODEL_SHA256 = "e150ed544dfe6016930c026a93913a5e3184181ebfe6ab2223ae01dd0491784c";
export const MODEL_ID = `${MODEL_REPO}/${MODEL_FILE}`;

export function defaultModelPath(): string {
  return process.env.DECIDIR_MODEL ?? join(homedir(), ".cache", "TypedDecisionMCP", MODEL_FILE);
}
