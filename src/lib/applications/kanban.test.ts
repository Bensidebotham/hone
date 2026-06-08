import { describe, it, expect } from "vitest";
import type { AppWithJob } from "@/app/(app)/applications/page";
import {
  KANBAN_STATUSES,
  KANBAN_COLUMNS,
  groupByStatus,
  moveApplication,
  isKanbanStatus,
} from "./kanban";

// Minimal fixture factory — only fields needed for kanban logic
function makeApp(id: string, status: string): AppWithJob {
  return {
    id,
    status,
    userId: "u1",
    jobId: `j-${id}`,
    notes: null,
    appliedAt: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    job: {
      id: `j-${id}`,
      title: `Job ${id}`,
      company: "Acme",
      location: null,
      url: null,
      description: null,
      salary: null,
      source: "manual",
      postedAt: null,
      createdAt: new Date("2024-01-01"),
    },
  } as unknown as AppWithJob;
}

// ── KANBAN_STATUSES / KANBAN_COLUMNS ──────────────────────────────────────────

describe("KANBAN_STATUSES", () => {
  it("contains exactly the 5 expected statuses in order", () => {
    expect(KANBAN_STATUSES).toEqual([
      "saved",
      "applied",
      "interviewing",
      "offer",
      "rejected",
    ]);
  });
});

describe("KANBAN_COLUMNS", () => {
  it("has a column entry for every status", () => {
    const statuses = KANBAN_COLUMNS.map((c) => c.status);
    expect(statuses).toEqual([...KANBAN_STATUSES]);
  });

  it("has human-readable labels", () => {
    const labels = KANBAN_COLUMNS.map((c) => c.label);
    expect(labels).toEqual([
      "Saved",
      "Applied",
      "Interviewing",
      "Offer",
      "Rejected",
    ]);
  });
});

// ── isKanbanStatus ────────────────────────────────────────────────────────────

describe("isKanbanStatus", () => {
  it("returns true for all valid statuses", () => {
    for (const s of KANBAN_STATUSES) {
      expect(isKanbanStatus(s)).toBe(true);
    }
  });

  it("returns false for unknown strings", () => {
    expect(isKanbanStatus("unknown")).toBe(false);
    expect(isKanbanStatus("")).toBe(false);
    expect(isKanbanStatus("SAVED")).toBe(false);
  });
});

// ── groupByStatus ─────────────────────────────────────────────────────────────

describe("groupByStatus", () => {
  it("returns an object with all 5 keys even when input is empty", () => {
    const grouped = groupByStatus([]);
    expect(Object.keys(grouped).sort()).toEqual(
      [...KANBAN_STATUSES].sort()
    );
    for (const status of KANBAN_STATUSES) {
      expect(grouped[status]).toEqual([]);
    }
  });

  it("places apps into the correct column", () => {
    const apps = [
      makeApp("a1", "saved"),
      makeApp("a2", "applied"),
      makeApp("a3", "saved"),
      makeApp("a4", "rejected"),
    ];
    const grouped = groupByStatus(apps);
    expect(grouped.saved.map((a) => a.id)).toEqual(["a1", "a3"]);
    expect(grouped.applied.map((a) => a.id)).toEqual(["a2"]);
    expect(grouped.interviewing).toEqual([]);
    expect(grouped.offer).toEqual([]);
    expect(grouped.rejected.map((a) => a.id)).toEqual(["a4"]);
  });

  it("preserves input order within each column", () => {
    const apps = [
      makeApp("z", "saved"),
      makeApp("m", "saved"),
      makeApp("a", "saved"),
    ];
    const grouped = groupByStatus(apps);
    expect(grouped.saved.map((a) => a.id)).toEqual(["z", "m", "a"]);
  });

  it("does not mutate the input array", () => {
    const apps = [makeApp("x", "saved")];
    const copy = [...apps];
    groupByStatus(apps);
    expect(apps).toEqual(copy);
  });
});

// ── moveApplication ───────────────────────────────────────────────────────────

describe("moveApplication", () => {
  function baseGrouped() {
    return groupByStatus([
      makeApp("a1", "saved"),
      makeApp("a2", "saved"),
      makeApp("a3", "applied"),
    ]);
  }

  it("moves an app from one column to another", () => {
    const before = baseGrouped();
    const after = moveApplication(before, "a1", "applied");
    expect(after.saved.map((a) => a.id)).toEqual(["a2"]);
    expect(after.applied.map((a) => a.id)).toEqual(["a3", "a1"]);
  });

  it("appends the moved app to the end of the target column", () => {
    const before = baseGrouped();
    const after = moveApplication(before, "a2", "applied");
    expect(after.applied.map((a) => a.id)).toEqual(["a3", "a2"]);
  });

  it("is a no-op when the app is already in the target column", () => {
    const before = baseGrouped();
    const after = moveApplication(before, "a3", "applied");
    // saved unchanged, applied unchanged
    expect(after.saved.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(after.applied.map((a) => a.id)).toEqual(["a3"]);
  });

  it("is a no-op when the appId is not found", () => {
    const before = baseGrouped();
    const after = moveApplication(before, "NOPE", "offer");
    expect(after.saved.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(after.offer).toEqual([]);
  });

  it("does not mutate the input grouped object", () => {
    const before = baseGrouped();
    const savedBefore = [...before.saved];
    moveApplication(before, "a1", "applied");
    expect(before.saved.map((a) => a.id)).toEqual(savedBefore.map((a) => a.id));
  });

  it("returns a new object (not the same reference)", () => {
    const before = baseGrouped();
    const after = moveApplication(before, "a1", "applied");
    expect(after).not.toBe(before);
  });

  it("returns new array references for affected columns", () => {
    const before = baseGrouped();
    const after = moveApplication(before, "a1", "applied");
    expect(after.saved).not.toBe(before.saved);
    expect(after.applied).not.toBe(before.applied);
  });

  it("updates the moved app's status to the target column status", () => {
    const before = baseGrouped();
    const after = moveApplication(before, "a1", "applied");
    const movedApp = after.applied.find((a) => a.id === "a1");
    expect(movedApp?.status).toBe("applied");
  });

  it("does not mutate the original app object's status", () => {
    const before = baseGrouped();
    const originalApp = before.saved.find((a) => a.id === "a1")!;
    const originalStatus = originalApp.status;
    moveApplication(before, "a1", "applied");
    expect(originalApp.status).toBe(originalStatus);
  });
});
