import { describe, expect, it } from "vitest";
import { acceptProxy, gate10x, pairHops, qualityOk, timeGateActive } from "./report-math.js";
import { countTokens } from "./token-count.js";

describe("report math", () => {
  it("uses the same chars/4 ruler when hop text is present", () => {
    const text = "thinking then json";
    const answers = { command: { type: "yesno", yes: 1 } };
    const paired = pairHops(
      [{ id: "cmd-01", latency_ms: 200, answers }],
      [{ id: "cmd-01", latency_ms: 4000, output_tokens: 99, text }],
      "cursor-ui"
    );
    expect(paired[0]?.ruler).toBe("chars/4");
    expect(paired[0]?.token).toBe(
      countTokens(text) / countTokens(JSON.stringify({ command: { type: "yesno", yes: 1 } }))
    );
  });

  it("requires 4/5 for a 10x win and splits quality from time", () => {
    expect(gate10x(4, 5)).toBe(true);
    expect(gate10x(3, 5)).toBe(false);
    expect(qualityOk(0.775, true)).toBe(true);
    expect(timeGateActive("cursor-ui", false)).toBe(true);
    expect(timeGateActive("cursor-subagent", false)).toBe(false);
    expect(timeGateActive("cursor-subagent", true)).toBe(true);
    expect(acceptProxy({ DECIDE_ACCEPT_PROXY: "1" })).toBe(true);
    expect(acceptProxy({ DECIDIR_ACCEPT_PROXY: "1" })).toBe(true);
    expect(acceptProxy({ DECIDE_ACCEPT_PROXY: "0", DECIDIR_ACCEPT_PROXY: "1" })).toBe(false);
    expect(acceptProxy({})).toBe(false);
  });
});
