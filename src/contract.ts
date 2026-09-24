import { z } from "zod";

export const yesnoQuestionSchema = z.object({
  type: z.literal("yesno"),
  instructions: z.string().min(1),
  options: z
    .object({
      yes: z.string().min(1),
      no: z.string().min(1)
    })
    .optional()
});

export const choiceQuestionSchema = z.object({
  type: z.literal("choice"),
  instructions: z.string().min(1),
  criteria: z
    .record(z.string(), z.string().nullable())
    .refine((c) => Object.keys(c).length >= 2, { message: "choice requires at least 2 options" })
    .refine((c) => Object.keys(c).length <= 255, { message: "choice allows at most 255 options" })
});

export const scoreQuestionSchema = z.object({
  type: z.literal("score"),
  instructions: z.string().min(1),
  criteria: z.array(z.string().min(1)).min(2).max(10)
});

export const questionSchema = z.discriminatedUnion("type", [
  yesnoQuestionSchema,
  choiceQuestionSchema,
  scoreQuestionSchema
]);

export const questionsSchema = z
  .record(z.string().min(1), questionSchema)
  .refine((q) => Object.keys(q).length >= 1, { message: "at least one question is required" });

export const stateSchema = z.union([
  z.string().min(1),
  z.record(z.string(), z.unknown()),
  z.array(z.unknown()).min(1)
]);

export const canonicalPresetSchema = z.enum([
  "command",
  "subagent",
  "diff",
  "file",
  "commit",
  "bundle"
]);

export const presetSchema = z.enum([
  "command",
  "subagent",
  "diff",
  "file",
  "commit",
  "bundle",
  "comando",
  "subagente",
  "ficheiro",
  "pacote"
]);

const PRESET_TO_CANONICAL = {
  command: "command",
  comando: "command",
  subagent: "subagent",
  subagente: "subagent",
  diff: "diff",
  file: "file",
  ficheiro: "file",
  commit: "commit",
  bundle: "bundle",
  pacote: "bundle"
} as const;

export type CanonicalPreset = z.infer<typeof canonicalPresetSchema>;

export function normalizePreset(preset: Preset): CanonicalPreset;
export function normalizePreset(preset: Preset | undefined): CanonicalPreset | undefined;
export function normalizePreset(preset: Preset | undefined): CanonicalPreset | undefined {
  if (preset === undefined) return undefined;
  return PRESET_TO_CANONICAL[preset];
}

export const decideInputSchema = z
  .object({
    state: stateSchema,
    preset: presetSchema.optional(),
    questions: questionsSchema.optional()
  })
  .refine((v) => v.preset !== undefined || v.questions !== undefined, {
    message: "preset or questions is required"
  });

export const yesnoAnswerSchema = z.object({
  type: z.literal("yesno"),
  yes: z.number().min(0).max(1)
});

export const choiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number().min(0).max(1)
});

export const scoreAnswerSchema = z.object({
  type: z.literal("score"),
  score: z.number(),
  legend: z.record(z.string(), z.string()),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number().min(0).max(1)
});

export const answerSchema = z.discriminatedUnion("type", [
  yesnoAnswerSchema,
  choiceAnswerSchema,
  scoreAnswerSchema
]);

export const actionSchema = z.enum(["auto", "review", "stop"]);

export const decideOutputSchema = z.object({
  engine: z.enum(["logits", "head-mlp"]),
  model: z.string(),
  answers: z.record(z.string(), answerSchema),
  action: actionSchema,
  reasons: z.array(
    z.object({
      id: z.string(),
      signal: z.number(),
      threshold: z.string()
    })
  ),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    generated_tokens: z.literal(0)
  }),
  latency_ms: z.number().nonnegative()
});

export type Question = z.infer<typeof questionSchema>;
export type Questions = z.infer<typeof questionsSchema>;
export type State = z.infer<typeof stateSchema>;
export type Preset = z.infer<typeof presetSchema>;
export type DecideInput = z.infer<typeof decideInputSchema>;
export type Answer = z.infer<typeof answerSchema>;
export type Answers = Record<string, Answer>;
export type Action = z.infer<typeof actionSchema>;
export type DecideOutput = z.infer<typeof decideOutputSchema>;

export class DecideError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 422) {
    super(message);
    this.name = "DecideError";
    this.code = code;
    this.status = status;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractCandidates(state: State): string[] {
  if (!isRecord(state)) return [];
  const raw = state.candidates;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function renderState(state: State): string {
  if (typeof state === "string") return state;
  return JSON.stringify(state, null, 2);
}

export function normalizeProbabilities(input: Record<string, number>): Record<string, number> {
  const keys = Object.keys(input);
  const clipped = Object.fromEntries(keys.map((k) => [k, Math.max(0, input[k] ?? 0)]));
  const sum = Object.values(clipped).reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    const even = 1 / Math.max(1, keys.length);
    return Object.fromEntries(keys.map((k) => [k, even]));
  }
  return Object.fromEntries(keys.map((k) => [k, (clipped[k] ?? 0) / sum]));
}

export function confidenceFromDistribution(probabilities: Record<string, number>): number {
  const values = Object.values(probabilities);
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  const max = sorted[0] ?? 0;
  const second = sorted[1] ?? 0;
  return Math.min(1, Math.max(0, max - second + max * 0.15));
}

export function parseDecideInput(raw: unknown): DecideInput {
  const parsed = decideInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DecideError("invalid_request", parsed.error.issues.map((i) => i.message).join("; "));
  }
  return parsed.data;
}
