export const HOP_IDS = ["cmd-01", "sub-01", "diff-01", "file-01", "commit-01"] as const;

export type HopId = (typeof HOP_IDS)[number];

export function isHopId(id: string): id is HopId {
  return (HOP_IDS as readonly string[]).includes(id);
}
