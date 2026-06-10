import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AppWithJob } from "@/app/(app)/applications/page";
import { ApplicationsTable } from "./applications-table";

// Server actions are not callable in jsdom; stub the module.
vi.mock("@/lib/applications/actions", () => ({
  updateStatus: vi.fn(),
  createManualApplication: vi.fn(),
  updateApplicationDetails: vi.fn(),
  deleteApplication: vi.fn(),
}));

function makeApp(id: string, status: string, company: string): AppWithJob {
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
      title: `Role ${id}`,
      company,
      location: null,
      url: null,
      salary: null,
      source: "paste",
    },
  } as unknown as AppWithJob;
}

describe("ApplicationsTable", () => {
  it("renders a row per application", () => {
    render(
      <ApplicationsTable
        applications={[makeApp("1", "applied", "Stripe"), makeApp("2", "saved", "Ramp")]}
      />
    );
    expect(screen.getByText("Stripe")).toBeInTheDocument();
    expect(screen.getByText("Ramp")).toBeInTheDocument();
  });

  it("shows the empty state when there are no applications", () => {
    render(<ApplicationsTable applications={[]} />);
    expect(screen.getByText(/no applications yet/i)).toBeInTheDocument();
  });

  it("renders the stat tiles", () => {
    render(<ApplicationsTable applications={[makeApp("1", "applied", "Stripe")]} />);
    expect(screen.getByText("Total tracked")).toBeInTheDocument();
    expect(screen.getByText("Offers")).toBeInTheDocument();
  });
});
