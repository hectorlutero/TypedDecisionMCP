/** One hop per preset. diff-02 is the "no" hop so the set is not all-yes. */
export const HOP_IDS = ["cmd-01", "sub-01", "diff-02", "file-01", "commit-01"] as const;

export type HopId = (typeof HOP_IDS)[number];

export function isHopId(id: string): id is HopId {
  return (HOP_IDS as readonly string[]).includes(id);
}

/** Unique substring of the hop user prompt, to find the chat in Cursor's DB. */
export const HOP_FINGERPRINTS: Record<HopId, string> = {
  "cmd-01": "rm -rf node_modules /tmp/build",
  "sub-01": "Where is the login form rendered?",
  "diff-02": "function decide() {\n  return 1;\n}",
  "file-01": "Change the default auto threshold",
  "commit-01": "export function add(a,b){return a+b}"
};
