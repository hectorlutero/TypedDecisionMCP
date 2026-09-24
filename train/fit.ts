import { l2Normalize, type ProbeHead } from "../src/engine/head-mlp.js";

export function fitSoftmax(
  vectors: number[][],
  labels: number[],
  classes: string[],
  lambda = 0.1,
  epochs = 400,
  lr = 0.8,
  activeK?: number[]
): ProbeHead {
  const n = vectors.length;
  const k = classes.length;
  if (n === 0 || k < 2) {
    throw new Error("fitSoftmax needs samples and at least 2 classes");
  }
  const X = vectors.map((row) => l2Normalize(row));
  const dim = X[0]?.length ?? 0;
  const weights = Array.from({ length: k }, () => Array.from({ length: dim }, () => 0));
  const bias = Array.from({ length: k }, () => 0);

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradW = Array.from({ length: k }, () => Array.from({ length: dim }, () => 0));
    const gradB = Array.from({ length: k }, () => 0);

    for (let i = 0; i < n; i += 1) {
      const x = X[i] ?? [];
      const kActive = Math.min(k, activeK?.[i] ?? k);
      const logits = weights.slice(0, kActive).map((w, c) => {
        let sum = bias[c] ?? 0;
        for (let d = 0; d < dim; d += 1) sum += (w[d] ?? 0) * (x[d] ?? 0);
        return sum;
      });
      const max = logits.reduce((best, value) => (value > best ? value : best), Number.NEGATIVE_INFINITY);
      const exps = logits.map((value) => Math.exp(value - max));
      const z = exps.reduce((acc, value) => acc + value, 0);
      const probs = exps.map((value) => value / z);
      const y = labels[i] ?? 0;
      for (let c = 0; c < kActive; c += 1) {
        const err = (probs[c] ?? 0) - (c === y ? 1 : 0);
        gradB[c] = (gradB[c] ?? 0) + err;
        const gw = gradW[c] ?? [];
        for (let d = 0; d < dim; d += 1) gw[d] = (gw[d] ?? 0) + err * (x[d] ?? 0);
      }
    }

    const scale = 1 / n;
    for (let c = 0; c < k; c += 1) {
      bias[c] = (bias[c] ?? 0) - lr * (gradB[c] ?? 0) * scale;
      const w = weights[c] ?? [];
      const gw = gradW[c] ?? [];
      for (let d = 0; d < dim; d += 1) {
        w[d] = (w[d] ?? 0) - lr * ((gw[d] ?? 0) * scale + lambda * (w[d] ?? 0));
      }
    }
  }

  return { classes, weights, bias };
}