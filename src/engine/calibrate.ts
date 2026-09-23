import { normalizeProbabilities } from "../contract.js";

const EPS = 1e-9;

export function optionMass(
  keys: string[],
  tokensByKey: Record<string, number[]>,
  probabilityOf: (token: number) => number
): Record<string, number> {
  return Object.fromEntries(
    keys.map((key) => [
      key,
      (tokensByKey[key] ?? []).reduce((sum, token) => sum + probabilityOf(token), 0)
    ])
  );
}

/** Contextual calibration: divide observed option mass by a null-prompt prior, then renormalize. */
export function divideByPrior(
  actual: Record<string, number>,
  prior: Record<string, number>,
  epsilon = EPS
): Record<string, number> {
  const calibrated = Object.fromEntries(
    Object.keys(actual).map((key) => {
      const denom = Math.max(prior[key] ?? 0, epsilon);
      return [key, (actual[key] ?? 0) / denom];
    })
  );
  return normalizeProbabilities(calibrated);
}

export function priorCacheKey(instructions: string, options: Array<{ key: string; label: string }>): string {
  return JSON.stringify({ instructions, options: options.map((opt) => [opt.key, opt.label]) });
}
