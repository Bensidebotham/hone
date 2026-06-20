import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { JobDetailPane, type JobDetailData } from "@/components/job-detail-pane";
import { getJobDescription } from "@/lib/jobs/actions";

// The description is loaded lazily via this server action — mock it so the test
// stays hermetic (no prisma/auth) and we can assert the on-demand fetch behavior.
vi.mock("@/lib/jobs/actions", () => ({ getJobDescription: vi.fn() }));
vi.mock("@/components/company-logo", () => ({ CompanyLogo: () => <div data-testid="logo" /> }));
vi.mock("@/components/save-job-button", () => ({ SaveJobButton: () => <button>Save</button> }));
vi.mock("@/components/match-button", () => ({
  MatchButton: ({ hasDescription }: { jobId: string; hasDescription: boolean }) => (
    <div data-testid="match" data-has-desc={String(hasDescription)} />
  ),
}));

const mockGet = vi.mocked(getJobDescription);

const baseJob: JobDetailData = {
  id: "job1",
  title: "Senior Engineer",
  company: "Acme",
  location: "Remote",
  salary: "$200k",
  url: "https://acme.example/job",
  external: false,
};

describe("JobDetailPane", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("renders key details immediately and does NOT fetch the description on mount", () => {
    render(<JobDetailPane job={baseJob} />);
    expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
    expect(screen.getByText("$200k")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show full description/i })).toBeInTheDocument();
    // The whole point of the refactor: no description egress until the user asks.
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("fetches and renders the description only when the button is clicked", async () => {
    mockGet.mockResolvedValue({ descriptionText: "Great role doing things.", descriptionHtml: null });
    render(<JobDetailPane job={baseJob} />);

    fireEvent.click(screen.getByRole("button", { name: /show full description/i }));

    expect(mockGet).toHaveBeenCalledWith("job1");
    expect(await screen.findByText("Great role doing things.")).toBeInTheDocument();
  });

  it("renders HTML descriptions when present", async () => {
    mockGet.mockResolvedValue({ descriptionText: "", descriptionHtml: "<p>HTML body</p>" });
    render(<JobDetailPane job={baseJob} />);

    fireEvent.click(screen.getByRole("button", { name: /show full description/i }));

    expect(await screen.findByText("HTML body")).toBeInTheDocument();
  });

  it("shows a 'no description' message when the job has none", async () => {
    mockGet.mockResolvedValue({ descriptionText: "", descriptionHtml: null });
    render(<JobDetailPane job={baseJob} />);

    fireEvent.click(screen.getByRole("button", { name: /show full description/i }));

    expect(await screen.findByText(/no description provided/i)).toBeInTheDocument();
  });

  it("disables resume matching for external (aggregator) listings", () => {
    render(<JobDetailPane job={{ ...baseJob, external: true }} />);
    expect(screen.getByTestId("match").getAttribute("data-has-desc")).toBe("false");
  });

  it("resets the loaded description when the selected job changes", async () => {
    mockGet.mockResolvedValue({ descriptionText: "First job description", descriptionHtml: null });
    const { rerender } = render(<JobDetailPane job={baseJob} />);

    fireEvent.click(screen.getByRole("button", { name: /show full description/i }));
    expect(await screen.findByText("First job description")).toBeInTheDocument();

    // Switching jobs must clear the previous description, not leak it onto the new one.
    rerender(<JobDetailPane job={{ ...baseJob, id: "job2", title: "Other Role" }} />);
    expect(screen.queryByText("First job description")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show full description/i })).toBeInTheDocument();
  });
});
