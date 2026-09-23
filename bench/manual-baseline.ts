import { z } from "zod";
import { DecideError } from "../src/contract.js";
import { HOP_IDS, isHopId } from "./hop-ids.js";
import { loadFixtures, type Fixture } from "./load-fixtures.js";

export const manualRowSchema = z.object({
  id: z.string().refine(isHopId, { message: "id must be one of the five hop fixtures" }),
  output_tokens: z.number().int().positive(),
  latency_ms: z.number().positive()
});

export const manualBaselineSchema = z.object({
  model: z.string().min(1),
  rows: z.array(manualRowSchema).length(HOP_IDS.length)
});

export type ManualBaseline = z.infer<typeof manualBaselineSchema>;

export type MeasuredBaseline = {
  source: "measured";
  method: "cursor-hop";
  model: string;
  recorded_at: string;
  rows: Array<{
    id: string;
    split: "authored";
    preset: Fixture["preset"];
    latency_ms: number;
    output_tokens: number;
    prompt_tokens: 0;
    text: "";
  }>;
};

export function parseManualBaseline(raw: unknown): ManualBaseline {
  const parsed = manualBaselineSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DecideError("invalid_request", parsed.error.issues.map((issue) => issue.message).join("; "));
  }
  const seen = new Set(parsed.data.rows.map((row) => row.id));
  const missing = HOP_IDS.filter((id) => !seen.has(id));
  if (missing.length) {
    throw new DecideError("invalid_request", `manual baseline missing hops: ${missing.join(", ")}`);
  }
  return parsed.data;
}

export function toMeasuredBaseline(manual: ManualBaseline, recordedAt = new Date().toISOString()): MeasuredBaseline {
  const fixtures = new Map(loadFixtures("authored").map((row) => [row.id, row]));
  return {
    source: "measured",
    method: "cursor-hop",
    model: manual.model,
    recorded_at: recordedAt,
    rows: HOP_IDS.map((id) => {
      const fixture = fixtures.get(id);
      const row = manual.rows.find((item) => item.id === id);
      if (!fixture || !row) {
        throw new DecideError("invalid_request", `hop ${id} not found`);
      }
      return {
        id,
        split: "authored" as const,
        preset: fixture.preset,
        latency_ms: row.latency_ms,
        output_tokens: row.output_tokens,
        prompt_tokens: 0 as const,
        text: "" as const
      };
    })
  };
}
