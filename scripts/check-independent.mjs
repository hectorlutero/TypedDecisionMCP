import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const banned = [/typesafe\.ai/i, /TYPESAFE_/, /\bnoul\b/, /\/v1\/systemone/];
const roots = ["src", "bench", "cursor", "examples", "scripts"];

function walk(dir, acc = []) {
  if (!statSync(dir, { throwIfNoEntry: false })) return acc;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, acc);
    else if (name !== "check-independent.mjs" && /\.(ts|js|mjs|json|mdc|md)$/.test(name)) acc.push(path);
  }
  return acc;
}

const hits = [];
for (const root of roots) {
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");
    for (const re of banned) {
      if (re.test(text)) hits.push(`${file} matches ${re}`);
    }
  }
}

if (hits.length) {
  console.error(hits.join("\n"));
  process.exit(1);
}
console.log("independent: ok");
