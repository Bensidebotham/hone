import { describe, it, expect } from "vitest";
import type { AppWithJob } from "@/app/(app)/applications/page";
import {
  filterApplications,
  sortApplications,
  summarize,
  nextSort,
  DEFAULT_DIR,
  type TableFilter,
  type TableSort,
} from "./table";

function makeApp(
  id: string,
  status: string,
  opts: {
    company?: string;
    title?: string;
    appliedAt?: Date | null;
    updatedAt?: Date;
    salaryMin?: number | null;
  } = {}
): AppWithJob {
  const updatedAt = opts.updatedAt ?? new Date("2024-01-01");
  return {
    id,
    status,
    userId: "u1",
    jobId: `j-${id}`,
    notes: null,
    appliedAt: opts.appliedAt ?? null,
    createdAt: new Date("2024-01-01"),
    updatedAt,
    job: {
      id: `j-${id}`,
      title: opts.title ?? `Job ${id}`,
      company: opts.company ?? "Acme",
      location: null,
      url: null,
      salary: null,
      salaryMin: opts.salaryMin ?? null,
      source: "paste",
    },
  } as unknown as AppWithJob;
}

describe("filterApplications", () => {
  const apps = [
    makeApp("a", "saved", { company: "Stripe" }),
    makeApp("b", "applied", { company: "Ramp" }),
    makeApp("c", "interviewing", { company: "Notion" }),
    makeApp("d", "offer", { company: "Vercel" }),
    makeApp("e", "rejected", { company: "Linear" }),
  ];

  it("All returns every application", () => {
    expect(filterApplications(apps, { search: "", filter: "all" })).toHaveLength(5);
  });

  it("Active returns applied/interviewing/offer only", () => {
    const ids = filterApplications(apps, { search: "", filter: "active" }).map((a) => a.id);
    expect(ids).toEqual(["b", "c", "d"]);
  });

  it("Saved returns only saved", () => {
    const ids = filterApplications(apps, { search: "", filter: "saved" }).map((a) => a.id);
    expect(ids).toEqual(["a"]);
  });

  it("search matches company case-insensitively", () => {
    const ids = filterApplications(apps, { search: "stri", filter: "all" }).map((a) => a.id);
    expect(ids).toEqual(["a"]);
  });

  it("search matches role title", () => {
    const list = [makeApp("x", "saved", { title: "Frontend Engineer" })];
    expect(filterApplications(list, { search: "frontend", filter: "all" })).toHaveLength(1);
  });
});

describe("sortApplications", () => {
  it("lastActivity sorts by updatedAt desc", () => {
    const apps = [
      makeApp("old", "saved", { updatedAt: new Date("2024-01-01") }),
      makeApp("new", "saved", { updatedAt: new Date("2024-03-01") }),
    ];
    expect(sortApplications(apps, "lastActivity", "desc").map((a) => a.id)).toEqual(["new", "old"]);
  });

  it("applied sorts by appliedAt desc with nulls last", () => {
    const apps = [
      makeApp("null", "saved", { appliedAt: null }),
      makeApp("jan", "applied", { appliedAt: new Date("2024-01-01") }),
      makeApp("mar", "applied", { appliedAt: new Date("2024-03-01") }),
    ];
    expect(sortApplications(apps, "applied", "desc").map((a) => a.id)).toEqual(["mar", "jan", "null"]);
  });

  it("company sorts A→Z case-insensitively", () => {
    const apps = [
      makeApp("1", "saved", { company: "zeta" }),
      makeApp("2", "saved", { company: "Alpha" }),
    ];
    expect(sortApplications(apps, "company", "asc").map((a) => a.id)).toEqual(["2", "1"]);
  });

  it("does not mutate the input array", () => {
    const apps = [makeApp("a", "saved"), makeApp("b", "saved")];
    const copy = [...apps];
    sortApplications(apps, "company", "asc");
    expect(apps).toEqual(copy);
  });
});

describe("summarize", () => {
  it("returns zero counts for an empty list", () => {
    expect(summarize([])).toEqual({ total: 0, applied: 0, interviewing: 0, offers: 0 });
  });

  it("counts each stage (counts only, no derived rate)", () => {
    const apps = [
      makeApp("a", "saved"),
      makeApp("b", "applied"),
      makeApp("c", "applied"),
      makeApp("d", "interviewing"),
      makeApp("e", "offer"),
      makeApp("f", "rejected"),
    ];
    expect(summarize(apps)).toEqual({ total: 6, applied: 2, interviewing: 1, offers: 1 });
  });
});

// Type guards so the test fails to compile if the public types drift
const _f: TableFilter = "active";
const _s: TableSort = "lastActivity";

describe("sortApplications — new keys & direction", () => {
  it("sorts by company asc and desc", () => {
    const apps = [
      makeApp("1", "applied", { company: "Zeta" }),
      makeApp("2", "applied", { company: "Alpha" }),
    ];
    expect(sortApplications(apps, "company", "asc").map((a) => a.id)).toEqual(["2", "1"]);
    expect(sortApplications(apps, "company", "desc").map((a) => a.id)).toEqual(["1", "2"]);
  });

  it("sorts by status using pipeline rank", () => {
    const apps = [
      makeApp("rej", "rejected"),
      makeApp("sav", "saved"),
      makeApp("int", "interviewing"),
    ];
    expect(sortApplications(apps, "status", "asc").map((a) => a.id)).toEqual(["sav", "int", "rej"]);
    expect(sortApplications(apps, "status", "desc").map((a) => a.id)).toEqual(["rej", "int", "sav"]);
  });

  it("sorts by applied date with nulls always last, both directions", () => {
    const apps = [
      makeApp("none", "saved", { appliedAt: null }),
      makeApp("old", "applied", { appliedAt: new Date("2025-01-01") }),
      makeApp("new", "applied", { appliedAt: new Date("2025-06-01") }),
    ];
    expect(sortApplications(apps, "applied", "desc").map((a) => a.id)).toEqual(["new", "old", "none"]);
    expect(sortApplications(apps, "applied", "asc").map((a) => a.id)).toEqual(["old", "new", "none"]);
  });

  it("sorts by salary using salaryMin with nulls always last", () => {
    const apps = [
      makeApp("none", "applied", { salaryMin: null }),
      makeApp("lo", "applied", { salaryMin: 50 }),
      makeApp("hi", "applied", { salaryMin: 120 }),
    ];
    expect(sortApplications(apps, "salary", "desc").map((a) => a.id)).toEqual(["hi", "lo", "none"]);
    expect(sortApplications(apps, "salary", "asc").map((a) => a.id)).toEqual(["lo", "hi", "none"]);
  });
});

describe("nextSort", () => {
  it("flips direction when the same key is clicked", () => {
    expect(nextSort("company", "asc", "company")).toEqual({ key: "company", dir: "desc" });
    expect(nextSort("company", "desc", "company")).toEqual({ key: "company", dir: "asc" });
  });
  it("uses the key's default direction when a new key is clicked", () => {
    expect(nextSort("company", "asc", "applied")).toEqual({ key: "applied", dir: DEFAULT_DIR.applied });
    expect(nextSort("applied", "asc", "salary")).toEqual({ key: "salary", dir: DEFAULT_DIR.salary });
  });
});
