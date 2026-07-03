import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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
