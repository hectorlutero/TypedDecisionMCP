import { openCursorDb, listRecentComposerIds, readCursorHopHits } from "./read-cursor-db.js";

const db = openCursorDb();
console.log(`Banco: ${db}`);
const ids = listRecentComposerIds(db, 10);
console.log(`Últimos ${ids.length} composer ids:`);
for (const id of ids) console.log(`  ${id}`);
const hits = readCursorHopHits(db);
console.log(`Hops reconhecidos: ${hits.length}`);
for (const hit of hits) {
  console.log(`  ${hit.id}  ${hit.latency_ms} ms  ${hit.composerId}  ${hit.text.slice(0, 80).replaceAll("\n", " ")}`);
}
if (hits.length === 0) {
  console.log("Nenhum hop. Confirma que colaste o JSON com rm -rf node_modules /tmp/build no chat.");
}
