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

const RECENT_COMPOSERS = 120;
const SINCE_SLACK_MS = 5 * 60 * 1000;

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
      timeout: 15_000
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

function parseValue(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function composerIdFromKey(key: string, prefix: string): string {
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

function afterSince(composer: CursorComposer, since: number): boolean {
  if (!since) return true;
  const stamp = composer.lastUpdatedAt ?? composer.createdAt ?? composer.assistantCreatedAt ?? composer.userCreatedAt;
  if (stamp == null) return true;
  return stamp >= since - SINCE_SLACK_MS;
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

function readComposer(dbPath: string, composerId: string): CursorComposer {
  const headerRows = sqliteJson(
    dbPath,
    `SELECT value FROM cursorDiskKV WHERE key = ${sqlQuote(`composerData:${composerId}`)}`
  ) as Array<{ value: string }>;
  const bubbleRows = sqliteJson(
    dbPath,
    `SELECT value FROM cursorDiskKV WHERE key LIKE ${sqlQuote(`bubbleId:${composerId}:%`)}`
  ) as Array<{ value: string }>;
  return composerFromRows(
    composerId,
    parseValue(headerRows[0]?.value),
    bubbleRows.map((row) => parseValue(row.value))
  );
}

export function readCursorScan(dbPath = openCursorDb()): { hits: CursorHopHit[]; skipped: CursorSkip[] } {
  const since = readSince();
  const composerIds = listRecentComposerIds(dbPath);
  const hits: CursorHopHit[] = [];
  const skipped: CursorSkip[] = [];
  for (const composerId of composerIds) {
    try {
      const composer = readComposer(dbPath, composerId);
      if (!afterSince(composer, since)) {
        skipped.push({ composerId, reason: "chat anterior ao reset" });
        continue;
      }
      const hit = toHopHit(composer);
      if (hit) hits.push(hit);
      else skipped.push({ composerId, reason: skipReason(composer) ?? "ignorado" });
    } catch (err) {
      skipped.push({
        composerId,
        reason: err instanceof Error ? err.message.slice(0, 120) : "erro a ler"
      });
    }
  }
  return { hits, skipped };
}

export function readCursorHopHits(dbPath = openCursorDb()): CursorHopHit[] {
  return readCursorScan(dbPath).hits;
}
