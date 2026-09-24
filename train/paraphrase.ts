import { isRecord } from "../src/contract.js";

export const TRAIN_VARIANTS = 4;

function bumpStrings(state: Record<string, unknown>, suffix: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...state };
  for (const [key, value] of Object.entries(copy)) {
    if (typeof value === "string") copy[key] = `${value}${suffix}`;
  }
  return copy;
}

export function paraphraseState(state: unknown, variant: number): unknown {
  if (variant <= 0) return state;
  if (typeof state === "string") {
    if (variant === 1) return `${state} `;
    if (variant === 2) return ` ${state}`;
    return `${state.replace(/\s+/g, " ").trim()}\n`;
  }
  if (!isRecord(state)) return state;
  if (variant === 1) return bumpStrings(state, " ");
  if (variant === 2) {
    const copy: Record<string, unknown> = { ...state };
    if (typeof copy.cwd === "string" && !copy.cwd.endsWith("/")) copy.cwd = `${copy.cwd}/`;
    else if (typeof copy.command === "string") copy.command = ` ${copy.command} `;
    if (typeof copy.diff === "string") copy.diff = `${copy.diff}\n`;
    return copy;
  }
  const copy: Record<string, unknown> = { ...state };
  if (typeof copy.task === "string" && copy.request === undefined) copy.request = copy.task;
  if (typeof copy.request === "string") copy.request = copy.request.replace(/\s+/g, " ").trim();
  if (typeof copy.tests === "string") copy.tests = `${copy.tests}.`;
  return copy;
}

export function expandAuthored<T extends { id: string; state: unknown }>(
  rows: T[]
): Array<T & { variant: number }> {
  return rows.flatMap((row) =>
    Array.from({ length: TRAIN_VARIANTS }, (_, variant) => ({
      ...row,
      variant,
      state: paraphraseState(row.state, variant)
    }))
  );
}