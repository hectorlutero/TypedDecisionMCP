import type { Action, Answer, Answers } from "./contract.js";

const RISK_IF_YES_IDS = new Set(["comando"]);

export type PolicyThresholds = {
  auto: number;
  review: number;
};

export function loadThresholds(env: NodeJS.ProcessEnv = process.env): PolicyThresholds {
  const auto = Number(env.DECIDIR_AUTO ?? 0.8);
  const review = Number(env.DECIDIR_REVIEW ?? 0.5);
  if (!(auto > review) || !(review > 0) || !(auto <= 1)) {
    throw new Error("DECIDIR_AUTO must be > DECIDIR_REVIEW, both in (0, 1]");
  }
  return { auto, review };
}

export function signalFor(id: string, answer: Answer): number {
  if (answer.type === "yesno") {
    return RISK_IF_YES_IDS.has(id) ? 1 - answer.yes : answer.yes;
  }
  return answer.confidence;
}

export function actionForSignal(signal: number, thresholds: PolicyThresholds = loadThresholds()): Action {
  if (signal < thresholds.review) return "stop";
  if (signal < thresholds.auto) return "review";
  return "auto";
}

const ACTION_RANK: Record<Action, number> = { auto: 2, review: 1, stop: 0 };

export function decideAction(
  answers: Answers,
  thresholds: PolicyThresholds = loadThresholds()
): { action: Action; reasons: { id: string; signal: number; threshold: string }[] } {
  const reasons = Object.entries(answers).map(([id, answer]) => {
    const signal = signalFor(id, answer);
    const action = actionForSignal(signal, thresholds);
    return { id, signal, threshold: action };
  });
  const action = reasons.reduce<Action>((worst, row) => {
    return ACTION_RANK[row.threshold] < ACTION_RANK[worst] ? row.threshold : worst;
  }, "auto");
  return { action, reasons };
}
