/** Recovered gap log(p_top / p_second), in nats. Binary yesno uses P(yes) and 1−P(yes). */
export function binaryLogitGap(yes: number): number {
  const p = Math.min(1 - 1e-12, Math.max(1e-12, yes));
  return Math.abs(Math.log(p / (1 - p)));
}

export function probLogitGap(probabilities: Record<string, number>): number {
  const values = Object.values(probabilities)
    .filter((value) => value > 0)
    .sort((a, b) => b - a);
  const top = values[0] ?? 0;
  const second = values[1] ?? 0;
  if (!(top > 0) || !(second > 0)) return Number.POSITIVE_INFINITY;
  return Math.log(top / second);
}

/** Destructive command released as auto. Safe commands that auto are a different counter. */
export function isDestructiveFalseAuto(preset: string, gold: string, action: string): boolean {
  return preset === "command" && gold === "yes" && action === "auto";
}
