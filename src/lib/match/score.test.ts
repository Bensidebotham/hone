import { describe, it, expect } from "vitest";
import { scoreMatch } from "@/lib/match/score";

describe("scoreMatch", () => {
  it("100 when resume covers all JD skills", () => {
    const r = scoreMatch("React TypeScript Node", "Need React and TypeScript");
    expect(r.score).toBe(100);
    expect(r.matched.sort()).toEqual(["react", "typescript"]);
    expect(r.missing).toEqual([]);
  });
  it("partial coverage scales the score", () => {
    const r = scoreMatch("React", "Need React, GraphQL, AWS, Docker");
    expect(r.score).toBe(25);
    expect(r.matched).toEqual(["react"]);
    expect(r.missing.sort()).toEqual(["aws", "docker", "graphql"]);
  });
  it("0 when JD has no recognized skills", () => {
    const r = scoreMatch("React", "We value teamwork and grit");
    expect(r.score).toBe(0);
  });
});
