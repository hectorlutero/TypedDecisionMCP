export function envFirst(env: NodeJS.ProcessEnv, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

export function fewShotEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return envFirst(env, "DECIDE_FEWSHOT", "DECIDIR_FEWSHOT") === "1";
}

export function engineKind(env: NodeJS.ProcessEnv = process.env): "logits" | "head-mlp" {
  return envFirst(env, "DECIDE_ENGINE", "DECIDIR_ENGINE") === "logits" ? "logits" : "head-mlp";
}
