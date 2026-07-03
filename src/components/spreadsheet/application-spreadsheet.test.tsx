import { it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ApplicationSpreadsheet } from "./application-spreadsheet";
import type { ApplicationRow } from "@/app/(app)/applications/page";

const actions = vi.hoisted(() => ({
  updateApplicationFields: vi.fn().mockResolvedValue(undefined),
  updateStatus: vi.fn().mockResolvedValue(undefined),
  markAppliedToday: vi.fn().mockResolvedValue(undefined),
  bulkUpdateStatus: vi.fn().mockResolvedValue(undefined),
  bulkMarkApplied: vi.fn().mockResolvedValue(undefined),
  bulkDelete: vi.fn().mockResolvedValue(undefined),
  saveColumnPrefs: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/applications/actions", () => actions);

const mk = (over: Partial<ApplicationRow>): ApplicationRow => ({
  id: "a1", userId: "u", company: "Stripe", title: "SWE", url: null, location: null,
  salary: "$180k", description: null, status: "applied", notes: null, appliedAt: null,
  followUpDate: null, source: null, contact: null, nextStep: null,
  createdAt: new Date(), updatedAt: new Date(), ...over,
} as ApplicationRow);

beforeEach(() => vi.clearAllMocks());

it("commits an inline salary edit via updateApplicationFields", () => {
  render(<ApplicationSpreadsheet applications={[mk({})]} prefs={null} />);
  fireEvent.doubleClick(screen.getByText("$180k"));
  // The toolbar's search input is also a "textbox"; the cell's edit input has
  // no accessible name, so target it precisely to avoid ambiguity.
  const input = screen.getByRole("textbox", { name: "" });
  fireEvent.change(input, { target: { value: "$200k" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(actions.updateApplicationFields).toHaveBeenCalledWith("a1", { salary: "$200k" });
});

it("preserves the seed character when typing to start an edit (does not clobber it)", () => {
  render(<ApplicationSpreadsheet applications={[mk({})]} prefs={null} />);
  // Activate the salary cell (a text/editable cell), then type a printable
  // character on the grid to trigger type-to-edit.
  fireEvent.click(screen.getByText("$180k"));
  const table = screen.getByText("$180k").closest("table")!;
  fireEvent.keyDown(table, { key: "X" });
  const input = screen.getByRole("textbox", { name: "" }) as HTMLInputElement;

  // The seeded value must NOT be select-all'd on mount — the caret should sit
  // at the end so the next keystroke appends instead of replacing everything.
  expect(input.value).toBe("X");
  expect(input.selectionStart).toBe(input.value.length);
  expect(input.selectionEnd).toBe(input.value.length);

  // Simulate real typing at the current caret/selection (fireEvent.change
  // alone doesn't respect selection ranges the way a browser keystroke does).
  function typeChar(char: string) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const next = input.value.slice(0, start) + char + input.value.slice(end);
    fireEvent.change(input, { target: { value: next } });
    const pos = start + char.length;
    input.setSelectionRange(pos, pos);
  }
  typeChar("Y");
  typeChar("Z");
  fireEvent.keyDown(input, { key: "Enter" });

  const [, patch] = actions.updateApplicationFields.mock.calls[0];
  expect((patch as { salary: string }).salary.startsWith("X")).toBe(true);
  expect((patch as { salary: string }).salary).toBe("XYZ");
});

it("shift-click selects a range and bulk-deletes them", () => {
  const rows = [mk({ id: "a1", company: "A" }), mk({ id: "a2", company: "B" }), mk({ id: "a3", company: "C" })];
  render(<ApplicationSpreadsheet applications={rows} prefs={null} />);
  const checks = screen.getAllByLabelText(/Select [ABC]/);
  fireEvent.click(checks[0]);
  fireEvent.click(checks[2], { shiftKey: true });
  expect(screen.getByText("3 selected")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
  expect(actions.bulkDelete).toHaveBeenCalledWith(["a1", "a2", "a3"]);
});

it("does not hijack keyboard input in the search box after a grid cell is active", () => {
  render(<ApplicationSpreadsheet applications={[mk({})]} prefs={null} />);
  // Activate a grid cell — this used to make the outer container's keydown
  // handler intercept and preventDefault every subsequent key, even ones
  // typed into the toolbar's search input.
  fireEvent.click(screen.getByText("Stripe"));
  const searchInput = screen.getByLabelText("Search applications");
  // fireEvent returns false only when preventDefault() was called on the event.
  expect(fireEvent.keyDown(searchInput, { key: "ArrowRight" })).toBe(true);
});
