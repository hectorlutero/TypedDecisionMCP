import { envFirst } from "../src/env.js";
import { isLatencyValid } from "./spawn.js";
import { hopTokens, transcriptTokens } from "./token-count.js";

export type BaselineMethod = "cursor-ui" | "cursor-subagent";

export type BaselineRow = {
  id: string;
  latency_ms: number;
  latency_raw_ms?: number;
  output_tokens: number;
  text?: string;
};

export type LogitsRow = {
  id: string;
  latency_ms: number;
  answers?: unknown;
};

export function acceptProxy(env: NodeJS.ProcessEnv = process.env): boolean {
  return envFirst(env, "DECIDE_ACCEPT_PROXY", "DECIDIR_ACCEPT_PROXY") === "1";
}

export function timeGateActive(method: BaselineMethod, hasSpawn: boolean): boolean {
  return method === "cursor-ui" || (method === "cursor-subagent" && hasSpawn);
}

export function pairHops(
  authored: LogitsRow[],
  baselineRows: BaselineRow[],
  method: BaselineMethod
): Array<{ id: string; token: number; time: number; ruler: "chars/4" | "ui"; validClock: boolean }> {
  const byId = new Map(baselineRows.map((row) => [row.id, row]));
  return authored.flatMap((row) => {
    const base = byId.get(row.id);
    if (!base) return [];
    const hop = hopTokens(base.text, base.output_tokens);
    const transcript = transcriptTokens(row.answers);
    return [
      {
        id: row.id,
        token: hop.tokens / transcript,
        time: base.latency_ms / Math.max(1, row.latency_ms),
        ruler: hop.ruler,
        validClock: isLatencyValid(base.latency_ms, base.latency_raw_ms)
      }
    ];
  });
}

export function gate10x(wins: number, n: number): boolean {
  return n > 0 && wins / n >= 0.8;
}

export function qualityOk(authoredAcc: number, generatedTokensZero: boolean): boolean {
  return authoredAcc >= 0.75 && generatedTokensZero;
}
