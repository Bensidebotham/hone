import { describe, it, expect } from "vitest";
import { resolveColumns, CATALOG, DEFAULT_VISIBLE, type TablePrefs } from "./columns";

const ids = (cols: { id: string }[]) => cols.map((c) => c.id);

describe("resolveColumns", () => {
  it("returns the default-visible set (in order) when prefs is null", () => {
    expect(ids(resolveColumns(null))).toEqual(DEFAULT_VISIBLE);
  });

  it("treats empty prefs as default", () => {
    expect(ids(resolveColumns({}))).toEqual(DEFAULT_VISIBLE);
    expect(ids(resolveColumns({ order: [], hidden: [] }))).toEqual(DEFAULT_VISIBLE);
  });

  it("applies an explicit order and appends unmentioned catalog columns after it", () => {
    const prefs: TablePrefs = { order: ["status", "company"], hidden: [] };
    const result = ids(resolveColumns(prefs));
    expect(result.slice(0, 2)).toEqual(["status", "company"]);
    // every catalog column present exactly once
    expect(new Set(result).size).toBe(result.length);
    expect(result).toContain("lastActivity");
  });

  it("removes hidden columns", () => {
    const prefs: TablePrefs = { order: ["company", "role", "status"], hidden: ["role"] };
    expect(ids(resolveColumns(prefs))).not.toContain("role");
    expect(ids(resolveColumns(prefs))).toContain("company");
  });

  it("ignores unknown ids in order and hidden", () => {
    const prefs = { order: ["company", "bogus"], hidden: ["nope"] } as unknown as TablePrefs;
    const result = ids(resolveColumns(prefs));
    expect(result).not.toContain("bogus");
    expect(result[0]).toBe("company");
  });

  it("keeps a new catalog column visible by default (not in order, not hidden)", () => {
    // Simulate: user ordered only a subset; a column they never mentioned still shows.
    const prefs: TablePrefs = { order: ["company"], hidden: ["notes"] };
    const result = ids(resolveColumns(prefs));
    expect(result).toContain("salary"); // unmentioned → appended visible
    expect(result).not.toContain("notes"); // explicitly hidden
  });
});
