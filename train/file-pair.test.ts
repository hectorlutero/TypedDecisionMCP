import { describe, expect, it } from "vitest";
import { pairText, pickCandidate } from "./file-pair.js";

describe("file pair", () => {
  it("picks the same path when the candidate list is reversed", () => {
    const rows = [
      { path: "src/policy.ts", yes: 0.2 },
      { path: "src/http.ts", yes: 0.7 },
      { path: "LICENSE", yes: 0.1 }
    ];
    expect(pickCandidate(rows)).toBe("src/http.ts");
    expect(pickCandidate([...rows].reverse())).toBe(pickCandidate(rows));
  });

  it("mentions only the candidate it was given", () => {
    const text = pairText("Open the port", "src/http.ts");
    expect(text).toContain("src/http.ts");
    expect(text).toContain("HTTP listen");
    expect(text).not.toContain("policy.ts");
  });
});