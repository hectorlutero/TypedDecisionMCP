import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { HOP_FINGERPRINTS, HOP_IDS, type HopId } from "./hop-ids.js";

export type CursorComposer = {
  composerId: string;
  createdAt?: number;
  lastUpdatedAt?: number;
  status?: string;
  model?: string;
  userText: string;
  assistantText: string;
  userCreatedAt?: number;
  assistantCreatedAt?: number;
};

export type CursorHopHit = {
  id: HopId;
  composerId: string;
  latency_ms: number;
  text: string;
  model?: string;
  clock: "cursor-db";
};

export function cursorDbCandidates(home = homedir(), env = process.env): string[] {
  return [
    join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb"),
    join(home, ".config", "Cursor", "User", "globalStorage", "state.vscdb"),
    env.APPDATA ? join(env.APPDATA, "Cursor", "User", "globalStorage", "state.vscdb") : ""
  ].filter((path) => path.length > 0);
}

export function resolveCursorDb(home = homedir(), env = process.env): string | undefined {
  return cursorDbCandidates(home, env).find((path) => existsSync(path));
}

export function matchHopId(userText: string): HopId | undefined {
  return HOP_IDS.find((id) => userText.includes(HOP_FINGERPRINTS[id]));
}

export function hopLatencyMs(row: {
  createdAt?: number;
  lastUpdatedAt?: number;
  userCreatedAt?: number;
  assistantCreatedAt?: number;
}): number | undefined {
  const end = row.lastUpdatedAt ?? row.assistantCreatedAt;
  const start = row.userCreatedAt ?? row.createdAt;
  if (end == null || start == null) return undefined;
  const ms = end - start;
  if (!(ms > 0) || ms > 30 * 60 * 1000) return undefined;
  return ms;
}

export function toHopHit(composer: CursorComposer): CursorHopHit | undefined {
  const id = matchHopId(composer.userText);
  if (!id || !composer.assistantText.trim()) return undefined;
  const latency_ms = hopLatencyMs(composer);
  if (latency_ms == null) return undefined;
  return {
    id,
    composerId: composer.composerId,
    latency_ms,
    text: composer.assistantText.trim(),
    model: composer.model,
    clock: "cursor-db"
  };
}

export function parseMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.length > 0) {
    const asNum = Number(value);
    if (Number.isFinite(asNum) && asNum > 0) return asNum;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

export function composerFromRows(
  composerId: string,
  header: Record<string, unknown>,
  bubbles: Array<Record<string, unknown>>
): CursorComposer {
  const model =
    (header.modelConfig && typeof header.modelConfig === "object"
      ? String((header.modelConfig as { modelName?: string }).modelName ?? "")
      : "") || undefined;
  const user = bubbles.find((b) => b.type === 1 && String(b.text ?? "").length > 0);
  const assistants = bubbles.filter((b) => b.type === 2 && String(b.text ?? "").trim().length > 0);
  const assistantText = assistants.map((b) => String(b.text ?? "")).join("\n\n");
  const firstAssistant = assistants[0];
  return {
    composerId,
    createdAt: parseMs(header.createdAt),
    lastUpdatedAt: parseMs(header.lastUpdatedAt),
    status: typeof header.status === "string" ? header.status : undefined,
    model: model || undefined,
    userText: String(user?.text ?? ""),
    assistantText,
    userCreatedAt: parseMs(user?.createdAt),
    assistantCreatedAt: parseMs(firstAssistant?.createdAt)
  };
}
