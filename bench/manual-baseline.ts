import { z } from "zod";
import { DecideError } from "../src/contract.js";
import { HOP_IDS, isHopId } from "./hop-ids.js";
import { loadFixtures, type Fixture } from "./load-fixtures.js";
import { applySpawn, isLatencyValid, spawnMedian } from "./spawn.js";
import { TOKENIZER_ID, countTokens } from "./token-count.js";

const hopId = z.string().refine(isHopId, { message: "id must be one of the five hop fixtures" });

export const uiRowSchema = z.object({
  id: hopId,
  output_tokens: z.number().int().positive(),
  latency_ms: z.number().positive(),
  text: z.string().optional()
});

export const proxyRowSchema = z.object({
  id: hopId,
  text: z.string().min(1),
  latency_raw_ms: z.number().positive()
});

export const manualBaselineSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("cursor-ui"),
    model: z.string().min(1),
    rows: z.array(uiRowSchema).length(HOP_IDS.length)
  }),
  z.object({
    method: z.literal("cursor-subagent"),
    model: z.string().min(1),
    spawn_ms: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
    rows: z.array(proxyRowSchema).length(HOP_IDS.length)
  })
]);

export type ManualBaseline = z.infer<typeof manualBaselineSchema>;

export type MeasuredRow = {
  id: string;
  split: "authored";
  preset: Fixture["preset"];
  latency_ms: number;
  latency_raw_ms?: number;
  output_tokens: number;
  prompt_tokens: 0;
  text: string;
};

export type MeasuredBaseline = {
  source: "measured";
  method: "cursor-ui" | "cursor-subagent";
  tokenizer: typeof TOKENIZER_ID;
  model: string;
  recorded_at: string;
  spawn_ms?: [number, number, number];
  rows: MeasuredRow[];
};

function requireHops<T extends { id: string }>(rows: T[]): void {
  const seen = new Set(rows.map((row) => row.id));
  const missing = HOP_IDS.filter((id) => !seen.has(id));
  if (missing.length) {
    throw new DecideError("invalid_request", `manual baseline missing hops: ${missing.join(", ")}`);
  }
}

export function parseManualBaseline(raw: unknown): ManualBaseline {
  const parsed = manualBaselineSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DecideError("invalid_request", parsed.error.issues.map((issue) => issue.message).join("; "));
  }
  requireHops(parsed.data.rows);
  return parsed.data;
}

export function toMeasuredBaseline(manual: ManualBaseline, recordedAt = new Date().toISOString()): MeasuredBaseline {
  const fixtures = new Map(loadFixtures("authored").map((row) => [row.id, row]));
  if (manual.method === "cursor-ui") {
    return {
      source: "measured",
      method: "cursor-ui",
      tokenizer: TOKENIZER_ID,
      model: manual.model,
      recorded_at: recordedAt,
      rows: HOP_IDS.map((id) => {
        const fixture = fixtures.get(id);
        const row = manual.rows.find((item) => item.id === id);
        if (!fixture || !row) throw new DecideError("invalid_request", `hop ${id} not found`);
        return {
          id,
          split: "authored" as const,
          preset: fixture.preset,
          latency_ms: row.latency_ms,
          output_tokens: row.output_tokens,
          prompt_tokens: 0 as const,
          text: row.text && row.text.length > 0 ? row.text : ""
        };
      })
    };
  }

  const spawn = spawnMedian(manual.spawn_ms);
  return {
    source: "measured",
    method: "cursor-subagent",
    tokenizer: TOKENIZER_ID,
    model: manual.model,
    recorded_at: recordedAt,
    spawn_ms: manual.spawn_ms,
    rows: HOP_IDS.map((id) => {
      const fixture = fixtures.get(id);
      const row = manual.rows.find((item) => item.id === id);
      if (!fixture || !row) throw new DecideError("invalid_request", `hop ${id} not found`);
      const latency_ms = applySpawn(row.latency_raw_ms, spawn);
      if (!isLatencyValid(latency_ms, row.latency_raw_ms)) {
        throw new DecideError(
          "invalid_request",
          `hop ${id} void: latency_ms ${latency_ms} < 0.5 × latency_raw_ms ${row.latency_raw_ms}`
        );
      }
      return {
        id,
        split: "authored" as const,
        preset: fixture.preset,
        latency_ms,
        latency_raw_ms: row.latency_raw_ms,
        output_tokens: countTokens(row.text),
        prompt_tokens: 0 as const,
        text: row.text
      };
    })
  };
}
