import { describe, it, expect } from "vitest";
import { rangeIds } from "./selection";

describe("rangeIds", () => {
  const rows = ["a", "b", "c", "d", "e"];
  it("returns the inclusive range regardless of direction", () => {
    expect(rangeIds(rows, "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeIds(rows, "d", "b")).toEqual(["b", "c", "d"]);
  });
  it("returns the single target when anchor is missing", () => {
    expect(rangeIds(rows, "zzz", "c")).toEqual(["c"]);
  });
  it("returns a single-element range when anchor === target", () => {
    expect(rangeIds(rows, "c", "c")).toEqual(["c"]);
  });
});
