import { HOP_IDS, type HopId } from "./hop-ids.js";

export type UiSample = { latency_ms: number; text: string };

export type UiManual = {
  method: "cursor-ui";
  model: string;
  rows: Array<{ id: HopId; samples: [UiSample, UiSample, UiSample] }>;
};

export type UiSlot = { id: HopId; sample: 0 | 1 | 2 };

export function emptyManual(model = "COLA_O_NOME_DO_MODELO_DA_UI"): UiManual {
  const blank = (): UiSample => ({ latency_ms: 0, text: "" });
  return {
    method: "cursor-ui",
    model,
    rows: HOP_IDS.map((id) => ({
      id,
      samples: [blank(), blank(), blank()]
    }))
  };
}

export function isSampleFilled(sample: UiSample): boolean {
  return sample.latency_ms > 0 && sample.text.trim().length > 0;
}

export function nextEmptySlot(manual: UiManual): UiSlot | undefined {
  for (const id of HOP_IDS) {
    const row = manual.rows.find((item) => item.id === id);
    if (!row) continue;
    const index = row.samples.findIndex((sample) => !isSampleFilled(sample));
    if (index === 0 || index === 1 || index === 2) return { id, sample: index };
  }
  return undefined;
}

export function applySample(manual: UiManual, slot: UiSlot, sample: UiSample): UiManual {
  return {
    ...manual,
    rows: manual.rows.map((row) => {
      if (row.id !== slot.id) return row;
      const samples = [...row.samples] as [UiSample, UiSample, UiSample];
      samples[slot.sample] = sample;
      return { ...row, samples };
    })
  };
}

export type UiLogLine = {
  at: string;
  id: HopId;
  sample: 0 | 1 | 2;
  latency_ms: number;
  text: string;
};
