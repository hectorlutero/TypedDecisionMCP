import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  composerFromRows,
  skipReason,
  toHopHit,
  resolveCursorDb,
  type CursorComposer,
  type CursorHopHit
} from "./cursor-store.js";
import { readSince } from "./ui-since.js";

const RECENT_COMPOSERS = 16;
const SINCE_SLACK_MS = 60 * 1000;

export type CursorSkip = { composerId: string; reason: string };

function sqlQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqliteToFile(db: string, sql: string): string {
  const out = join(tmpdir(), `td-sql-${process.pid}-${Math.random().toString(16).slice(2)}.json`);
  const fd = openSync(out, "w");
  try {
    execFileSync("sqlite3", ["-readonly", "-json", db, sql], {
      stdio: ["ignore", fd, "pipe"],
      maxBuffer: 8 * 1024 * 1024,
      timeout: 12_000
    });
  } finally {
    closeSync(fd);
  }
  const raw = readFileSync(out, "utf8").trim();
  unlinkSync(out);
  return raw;
}

function sqliteJson(db: string, sql: string): unknown[] {
  const raw = sqliteToFile(db, sql);
  if (!raw) return [];
  return JSON.parse(raw) as unknown[];
}

function composerIdFromKey(key: string, prefix: string): string {
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

function afterSince(composer: CursorComposer, since: number): boolean {
  if (!since) return true;
  const born = composer.createdAt ?? composer.userCreatedAt;
  if (born == null) return false;
  return born >= since - SINCE_SLACK_MS;
}

function bubbleIdsFromHeader(header: Record<string, unknown>): string[] {
  const raw = header.fullConversationHeadersOnly;
  let rows: unknown = raw;
  if (typeof raw === "string") {
    try {
      rows = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return "";
      const item = row as { bubbleId?: unknown; id?: unknown };
      return String(item.bubbleId ?? item.id ?? "");
    })
    .filter((id) => id.length > 0);
}

export function openCursorDb(): string {
  const override = process.env.CURSOR_VSCDB;
  if (override && existsSync(override)) return override;
  const found = resolveCursorDb();
  if (!found) {
    throw new Error(
      "Não achei state.vscdb do Cursor. No Linux costuma ser ~/.config/Cursor/User/globalStorage/state.vscdb"
    );
  }
  return found;
}

export function listRecentComposerIds(dbPath: string, limit = RECENT_COMPOSERS): string[] {
  const rows = sqliteJson(
    dbPath,
    `SELECT key FROM cursorDiskKV WHERE key LIKE 'composerData:%' ORDER BY rowid DESC LIMIT ${limit}`
  ) as Array<{ key: string }>;
  return rows.map((row) => composerIdFromKey(row.key, "composerData:"));
}

function readComposers(dbPath: string, composerIds: string[]): CursorComposer[] {
  if (composerIds.length === 0) return [];
  const headerKeys = composerIds.map((id) => sqlQuote(`composerData:${id}`)).join(", ");
  const headerRows = sqliteJson(
    dbPath,
    `SELECT key,
            json_extract(value, '$.name') AS name,
            json_extract(value, '$.createdAt') AS createdAt,
            json_extract(value, '$.lastUpdatedAt') AS lastUpdatedAt,
            json_extract(value, '$.modelConfig.modelName') AS model,
            json_extract(value, '$.fullConversationHeadersOnly') AS fullConversationHeadersOnly
       FROM cursorDiskKV WHERE key IN (${headerKeys})`
  ) as Array<Record<string, unknown>>;

  const bubbleKeys: string[] = [];
  const headersById = new Map<string, Record<string, unknown>>();
  for (const row of headerRows) {
    const composerId = composerIdFromKey(String(row.key ?? ""), "composerData:");
    const header = {
      name: row.name,
      createdAt: row.createdAt,
      lastUpdatedAt: row.lastUpdatedAt,
      modelConfig: { modelName: row.model },
      fullConversationHeadersOnly: row.fullConversationHeadersOnly
    };
    headersById.set(composerId, header);
    for (const bubbleId of bubbleIdsFromHeader(header)) {
      bubbleKeys.push(`bubbleId:${composerId}:${bubbleId}`);
    }
  }

  const bubblesByComposer = new Map<string, Array<Record<string, unknown>>>();
  for (const id of composerIds) bubblesByComposer.set(id, []);
  if (bubbleKeys.length > 0) {
    const bubbleRows = sqliteJson(
      dbPath,
      `SELECT key,
              json_extract(value, '$.type') AS type,
              json_extract(value, '$.text') AS text,
              json_extract(value, '$.thinking.text') AS thinking,
              json_extract(value, '$.turnDurationMs') AS turnDurationMs,
              json_extract(value, '$.createdAt') AS createdAt
         FROM cursorDiskKV WHERE key IN (${[...new Set(bubbleKeys)].map(sqlQuote).join(", ")})`
    ) as Array<Record<string, unknown>>;
    for (const row of bubbleRows) {
      const key = String(row.key ?? "");
      const composerId = composerIds.find((id) => key.startsWith(`bubbleId:${id}:`));
      if (!composerId) continue;
      bubblesByComposer.get(composerId)?.push({
        type: row.type,
        text: row.text,
        createdAt: row.createdAt,
        turnDurationMs: row.turnDurationMs,
        thinking: typeof row.thinking === "string" && row.thinking.length > 0 ? { text: row.thinking } : undefined
      });
    }
  }

  return composerIds.map((composerId) =>
    composerFromRows(composerId, headersById.get(composerId) ?? {}, bubblesByComposer.get(composerId) ?? [])
  );
}

export function readCursorScan(dbPath = openCursorDb()): { hits: CursorHopHit[]; skipped: CursorSkip[] } {
  const since = readSince();
  const composerIds = listRecentComposerIds(dbPath);
  const hits: CursorHopHit[] = [];
  const skipped: CursorSkip[] = [];
  let composers: CursorComposer[] = [];
  try {
    composers = readComposers(dbPath, composerIds);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err));
  }
  for (const composer of composers) {
    if (!afterSince(composer, since)) {
      skipped.push({ composerId: composer.composerId, reason: "chat anterior ao reset" });
      continue;
    }
    const hit = toHopHit(composer);
    if (hit) hits.push(hit);
    else skipped.push({ composerId: composer.composerId, reason: skipReason(composer) ?? "ignorado" });
  }
  return { hits, skipped };
}

export function readCursorHopHits(dbPath = openCursorDb()): CursorHopHit[] {
  return readCursorScan(dbPath).hits;
}
