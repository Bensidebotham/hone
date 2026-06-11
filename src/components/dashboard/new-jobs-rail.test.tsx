import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NewJobsRail } from "@/components/dashboard/new-jobs-rail";

const jobs = [
  { id: "j1", title: "Frontend Engineer", company: "Linear", location: "Remote", url: "https://x" },
];

describe("NewJobsRail", () => {
  it("renders a job row and the view-all link", () => {
    render(<NewJobsRail jobs={jobs} />);
    expect(screen.getByText("Frontend Engineer")).toBeInTheDocument();
    expect(screen.getByText(/View all jobs/i)).toBeInTheDocument();
  });

  it("renders a friendly empty state when caught up", () => {
    render(<NewJobsRail jobs={[]} />);
    expect(screen.getByText(/caught up/i)).toBeInTheDocument();
  });
});
