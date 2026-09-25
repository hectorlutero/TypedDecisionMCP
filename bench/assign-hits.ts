import { HOP_IDS } from "./hop-ids.js";
import type { CursorHopHit } from "./cursor-store.js";
import { applySample, type UiManual } from "./ui-log-state.js";

export function assignHits(
  manual: UiManual,
  hits: CursorHopHit[],
  seen: Set<string>
): { manual: UiManual; added: CursorHopHit[] } {
  const added: CursorHopHit[] = [];
  let next = manual;
  const unused = hits.filter((hit) => !seen.has(hit.composerId));
  for (const id of HOP_IDS) {
    const row = next.rows.find((item) => item.id === id);
    if (!row) continue;
    const emptySlots = row.samples
      .map((sample, index) => ({ sample, index }))
      .filter((item) => !(item.sample.latency_ms > 0 && item.sample.text.trim()));
    const pool = unused.filter((hit) => hit.id === id && !added.includes(hit));
    for (const slot of emptySlots) {
      const hit = pool.shift();
      if (!hit) break;
      next = applySample(next, { id, sample: slot.index as 0 | 1 | 2 }, {
        latency_ms: hit.latency_ms,
        text: hit.text
      });
      if (hit.model && next.model.startsWith("COLA_")) next = { ...next, model: hit.model };
      seen.add(hit.composerId);
      added.push(hit);
    }
  }
  return { manual: next, added };
}
