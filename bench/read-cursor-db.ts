import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  composerFromRows,
  resolveCursorDb,
  toHopHit,
  type CursorHopHit
} from "./cursor-store.js";

const RECENT_COMPOSERS = 80;

function sqlQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqliteToFile(db: string, sql: string): string {
  const out = join(tmpdir(), `td-sql-${process.pid}-${Math.random().toString(16).slice(2)}.json`);
  const fd = openSync(out, "w");
  try {
    execFileSync("sqlite3", ["-readonly", "-json", dbUri(db), sql], {
      stdio: ["ignore", fd, "pipe"],
      maxBuffer: 4 * 1024 * 1024,
      timeout: 20_000
    });
  } finally {
    closeSync(fd);
  }
  const raw = readFileSync(out, "utf8").trim();
  unlinkSync(out);
  return raw;
}

function dbUri(db: string): string {
  return `file:${db}?mode=ro`;
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

export function readCursorHopHits(dbPath = openCursorDb()): CursorHopHit[] {
  const composerIds = listRecentComposerIds(dbPath);
  const hits: CursorHopHit[] = [];
  for (const composerId of composerIds) {
    const headerRows = sqliteJson(
      dbPath,
      `SELECT value FROM cursorDiskKV WHERE key = ${sqlQuote(`composerData:${composerId}`)}`
    ) as Array<{ value: string }>;
    const bubbleRows = sqliteJson(
      dbPath,
      `SELECT value FROM cursorDiskKV WHERE key LIKE ${sqlQuote(`bubbleId:${composerId}:%`)}`
    ) as Array<{ value: string }>;
    const composer = composerFromRows(
      composerId,
      parseValue(headerRows[0]?.value),
      bubbleRows.map((row) => parseValue(row.value))
    );
    const hit = toHopHit(composer);
    if (hit) hits.push(hit);
  }
  return hits;
}
