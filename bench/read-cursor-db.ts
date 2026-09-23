import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  composerFromRows,
  resolveCursorDb,
  toHopHit,
  type CursorHopHit
} from "./cursor-store.js";

function sqliteJson(db: string, sql: string): unknown[] {
  const raw = execFileSync("sqlite3", ["-readonly", "-json", db, sql], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  if (!raw.trim()) return [];
  return JSON.parse(raw) as unknown[];
}

function snapshotDb(src: string): string {
  const dest = join(tmpdir(), `typed-decision-cursor-${process.pid}.vscdb`);
  try {
    execFileSync("sqlite3", [src, `.backup ${dest}`], { encoding: "utf8" });
    return dest;
  } catch {
    copyFileSync(src, dest);
    const wal = `${src}-wal`;
    if (existsSync(wal)) copyFileSync(wal, `${dest}-wal`);
    return dest;
  }
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

export function readCursorHopHits(dbPath = resolveCursorDb()): CursorHopHit[] {
  if (!dbPath) {
    throw new Error(
      "Não achei state.vscdb do Cursor. Fecha e abre o Cursor uma vez, ou passa CURSOR_VSCDB=caminho."
    );
  }
  const override = process.env.CURSOR_VSCDB;
  const src = override && existsSync(override) ? override : dbPath;
  const snap = snapshotDb(src);
  try {
    const headers = sqliteJson(
      snap,
      "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'"
    ) as Array<{ key: string; value: string }>;
    const hits: CursorHopHit[] = [];
    for (const row of headers) {
      const composerId = row.key.slice("composerData:".length);
      const header = parseValue(row.value);
      const bubbles = sqliteJson(
        snap,
        `SELECT value FROM cursorDiskKV WHERE key LIKE 'bubbleId:${composerId}:%'`
      ) as Array<{ value: string }>;
      const composer = composerFromRows(
        composerId,
        header,
        bubbles.map((item) => parseValue(item.value))
      );
      const hit = toHopHit(composer);
      if (hit) hits.push(hit);
    }
    return hits.sort((a, b) => a.latency_ms - b.latency_ms);
  } finally {
    if (existsSync(snap)) unlinkSync(snap);
    if (existsSync(`${snap}-wal`)) unlinkSync(`${snap}-wal`);
  }
}
