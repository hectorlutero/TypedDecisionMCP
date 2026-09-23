import { describe, expect, it } from "vitest";
import { composerFromRows, hopLatencyMs, matchHopId, toHopHit } from "./cursor-store.js";

describe("cursor-store", () => {
  it("matches hop fingerprints", () => {
    expect(matchHopId('{"command":"rm -rf node_modules /tmp/build"}')).toBe("cmd-01");
    expect(matchHopId("Where is the login form rendered? Do not edit files.")).toBe("sub-01");
    expect(matchHopId("function decide() {\n  return 1;\n}")).toBe("diff-02");
    expect(matchHopId("Change the default auto threshold")).toBe("file-01");
    expect(matchHopId("export function add(a,b){return a+b}")).toBe("commit-01");
    expect(matchHopId("hello")).toBeUndefined();
    expect(
      matchHopId("rm -rf node_modules /tmp/build\nWhere is the login form rendered?")
    ).toBeUndefined();
  });

  it("uses user createdAt → lastUpdatedAt as the hop clock", () => {
    expect(
      hopLatencyMs({
        createdAt: 1000,
        userCreatedAt: 5000,
        lastUpdatedAt: 9200,
        assistantCreatedAt: 5100
      })
    ).toBe(4200);
  });

  it("matches a hop when the prompt is only in richText", () => {
    const composer = composerFromRows(
      "rich",
      { createdAt: 1, lastUpdatedAt: 2001 },
      [
        { type: 1, richText: "command: rm -rf node_modules /tmp/build" },
        { type: 2, text: '{"comando":"yes"}' }
      ]
    );
    expect(toHopHit(composer)?.id).toBe("cmd-01");
  });

  it("builds a hop hit from composer bubbles", () => {
    const composer = composerFromRows(
      "fdf30a74-cdd5-4b41-9290-d1953a396980",
      { createdAt: 1, lastUpdatedAt: 4101, modelConfig: { modelName: "composer" } },
      [
        { type: 1, text: "rm -rf node_modules /tmp/build", createdAt: 100 },
        { type: 2, text: "The command is destructive.\n{\"comando\":\"yes\"}", createdAt: 200 }
      ]
    );
    const hit = toHopHit(composer);
    expect(hit?.id).toBe("cmd-01");
    expect(hit?.latency_ms).toBe(4001);
    expect(hit?.text).toContain("comando");
    expect(hit?.clock).toBe("cursor-db");
  });
});
