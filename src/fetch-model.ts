import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { defaultModelPath, MODEL_SHA256, MODEL_URL } from "./model-path.js";

async function main(): Promise<void> {
  const dest = defaultModelPath();
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest) && sha256(dest) === MODEL_SHA256) {
    console.log(`already present ${dest}`);
    return;
  }
  console.log(`downloading ${MODEL_URL}`);
  const res = await fetch(MODEL_URL, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`download failed: ${res.status} ${res.statusText}`);
  }
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
  const hash = sha256(dest);
  if (hash !== MODEL_SHA256) {
    throw new Error(`sha256 mismatch: got ${hash} expected ${MODEL_SHA256}`);
  }
  console.log(`saved ${dest}`);
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
