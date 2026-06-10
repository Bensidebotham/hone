import { describe, it, expect } from "vitest";
import type { AppWithJob } from "@/app/(app)/applications/page";
import {
  filterApplications,
  sortApplications,
  summarize,
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
    expect(sortApplications(apps, "lastActivity").map((a) => a.id)).toEqual(["new", "old"]);
  });

  it("applied sorts by appliedAt desc with nulls last", () => {
    const apps = [
      makeApp("null", "saved", { appliedAt: null }),
      makeApp("jan", "applied", { appliedAt: new Date("2024-01-01") }),
      makeApp("mar", "applied", { appliedAt: new Date("2024-03-01") }),
    ];
    expect(sortApplications(apps, "applied").map((a) => a.id)).toEqual(["mar", "jan", "null"]);
  });

  it("company sorts A→Z case-insensitively", () => {
    const apps = [
      makeApp("1", "saved", { company: "zeta" }),
      makeApp("2", "saved", { company: "Alpha" }),
    ];
    expect(sortApplications(apps, "company").map((a) => a.id)).toEqual(["2", "1"]);
  });

  it("does not mutate the input array", () => {
    const apps = [makeApp("a", "saved"), makeApp("b", "saved")];
    const copy = [...apps];
    sortApplications(apps, "company");
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
