import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HOP_FINGERPRINTS } from "./hop-ids.js";
import {
  composerFromRows,
  resolveCursorDb,
  toHopHit,
  type CursorHopHit
} from "./cursor-store.js";

const SQL_NEEDLES = [
  HOP_FINGERPRINTS["cmd-01"],
  HOP_FINGERPRINTS["sub-01"],
  "Rename decide() to runDecision()",
  HOP_FINGERPRINTS["file-01"],
  HOP_FINGERPRINTS["commit-01"]
];

function sqlQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqliteToFile(db: string, sql: string): string {
  const out = join(tmpdir(), `td-sql-${process.pid}-${Math.random().toString(16).slice(2)}.json`);
  const fd = openSync(out, "w");
  try {
    execFileSync("sqlite3", ["-readonly", "-json", db, sql], {
      stdio: ["ignore", fd, "pipe"],
      maxBuffer: 2 * 1024 * 1024
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

function composerIdFromBubbleKey(key: string): string | undefined {
  if (!key.startsWith("bubbleId:")) return undefined;
  const rest = key.slice("bubbleId:".length);
  const cut = rest.indexOf(":");
  if (cut <= 0) return undefined;
  return rest.slice(0, cut);
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

export function readCursorHopHits(dbPath = openCursorDb()): CursorHopHit[] {
  const like = SQL_NEEDLES.map((needle) => `value LIKE '%' || ${sqlQuote(needle)} || '%'`).join(" OR ");
  const keyRows = sqliteJson(
    dbPath,
    `SELECT key FROM cursorDiskKV WHERE key LIKE 'bubbleId:%' AND (${like})`
  ) as Array<{ key: string }>;
  const composerIds = [...new Set(keyRows.map((row) => composerIdFromBubbleKey(row.key)).filter(Boolean))] as string[];
  const hits: CursorHopHit[] = [];
  for (const composerId of composerIds) {
    const headerRows = sqliteJson(
      dbPath,
      `SELECT value FROM cursorDiskKV WHERE key = ${sqlQuote(`composerData:${composerId}`)}`
    ) as Array<{ value: string }>;
    const bubbleKeys = sqliteJson(
      dbPath,
      `SELECT key FROM cursorDiskKV WHERE key LIKE ${sqlQuote(`bubbleId:${composerId}:%`)}`
    ) as Array<{ key: string }>;
    const bubbles = bubbleKeys.map((row) => {
      const one = sqliteJson(dbPath, `SELECT value FROM cursorDiskKV WHERE key = ${sqlQuote(row.key)}`) as Array<{
        value: string;
      }>;
      return parseValue(one[0]?.value);
    });
    const composer = composerFromRows(composerId, parseValue(headerRows[0]?.value), bubbles);
    const hit = toHopHit(composer);
    if (hit) hits.push(hit);
  }
  return hits;
}
