import { describe, it, expect } from "vitest";
import {
  KANBAN_STATUSES,
  KANBAN_COLUMNS,
  isKanbanStatus,
} from "./kanban";

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
