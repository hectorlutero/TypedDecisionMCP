import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { activeSpec, resolveModelPath } from "./model-path.js";

async function main(): Promise<void> {
  const spec = activeSpec();
  const dest = resolveModelPath();
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest) && (await sha256(dest)) === spec.sha256) {
    console.log(`already present ${dest}`);
    return;
  }
  console.log(`downloading ${spec.url}`);
  const res = await fetch(spec.url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`download failed: ${res.status} ${res.statusText}`);
  }
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
  const hash = await sha256(dest);
  if (hash !== spec.sha256) {
    throw new Error(`sha256 mismatch: got ${hash} expected ${spec.sha256}`);
  }
  console.log(`saved ${dest} (${spec.repo}/${spec.file})`);
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
