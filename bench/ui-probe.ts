import { openCursorDb, listRecentComposerIds, readCursorScan } from "./read-cursor-db.js";

const db = openCursorDb();
console.log(`Banco: ${db}`);
const ids = listRecentComposerIds(db, 8);
console.log(`Últimos ${ids.length} composer ids:`);
for (const id of ids) console.log(`  ${id}`);
const scan = readCursorScan(db);
console.log(`Hops reconhecidos: ${scan.hits.length}`);
for (const hit of scan.hits) {
  console.log(`  ${hit.id}  ${hit.latency_ms} ms  ${hit.composerId}  ${hit.text.slice(0, 80).replaceAll("\n", " ")}`);
}
const notable = scan.skipped.filter((row) => row.reason !== "sem texto do hop" && row.reason !== "chat anterior ao reset");
console.log(`Ignorados relevantes: ${notable.length}`);
for (const row of notable.slice(0, 12)) {
  console.log(`  ${row.composerId}  ${row.reason}`);
}
