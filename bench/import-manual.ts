import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseManualBaseline, toMeasuredBaseline } from "./manual-baseline.js";

const root = dirname(fileURLToPath(import.meta.url));

export function importManualFile(
  src = join(root, "manual.json"),
  dest = join(root, "baseline.json")
): string {
  if (!existsSync(src)) {
    throw new Error(
      `missing ${src} — copy bench/manual.template.json (cursor-ui) or bench/proxy.template.json (cursor-subagent) to bench/manual.json`
    );
  }
  const manual = parseManualBaseline(JSON.parse(readFileSync(src, "utf8")));
  const measured = toMeasuredBaseline(manual);
  writeFileSync(dest, JSON.stringify(measured, null, 2));
  return dest;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("import-manual.ts")) {
  try {
    console.log(importManualFile());
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  }
}
