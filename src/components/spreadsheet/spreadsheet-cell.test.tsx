import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SpreadsheetCell } from "./spreadsheet-cell";
import { CATALOG } from "@/lib/applications/columns";
import type { ApplicationRow } from "@/app/(app)/applications/page";

const app = { id: "a1", company: "Stripe", title: "SWE", salary: "$180k", status: "applied",
  appliedAt: null, followUpDate: null, source: null, contact: null, nextStep: null,
  location: null, url: null, notes: null, description: null,
  userId: "u", createdAt: new Date(), updatedAt: new Date() } as ApplicationRow;
const salaryCol = CATALOG.find((c) => c.id === "salary")!;

const noop = () => {};

it("shows the value in display mode and commits an edited value", () => {
  const onCommit = vi.fn();
  const { rerender } = render(
    <table><tbody><tr>
      <SpreadsheetCell app={app} column={salaryCol} isActive isEditing={false}
        onActivate={noop} onBeginEdit={noop} onCommit={onCommit} onCancel={noop} onStatusChange={noop} />
    </tr></tbody></table>
  );
  expect(screen.getByText("$180k")).toBeInTheDocument();

  rerender(
    <table><tbody><tr>
      <SpreadsheetCell app={app} column={salaryCol} isActive isEditing={true}
        onActivate={noop} onBeginEdit={noop} onCommit={onCommit} onCancel={noop} onStatusChange={noop} />
    </tr></tbody></table>
  );
  const input = screen.getByRole("textbox") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "$200k" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onCommit).toHaveBeenCalledWith("$200k");
});
