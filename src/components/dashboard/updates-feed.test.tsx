import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UpdatesFeed } from "@/components/dashboard/updates-feed";

const rows = [
  {
    id: "e1",
    applicationId: "a1",
    status: "interviewing" as const,
    summary: "Moved to Interviewing",
    createdAt: new Date(),
    isNew: true,
    job: { title: "SWE", company: "Acme" },
  },
];

describe("UpdatesFeed", () => {
  it("renders an update row with summary and company", () => {
    render(<UpdatesFeed updates={rows} />);
    expect(screen.getByText("Moved to Interviewing")).toBeInTheDocument();
    expect(screen.getByText(/Acme/)).toBeInTheDocument();
  });

  it("renders a friendly empty state when there are no updates", () => {
    render(<UpdatesFeed updates={[]} />);
    expect(screen.getByText(/No updates since your last visit/i)).toBeInTheDocument();
  });
});
