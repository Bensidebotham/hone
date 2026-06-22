import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FunnelChart } from "@/components/analytics/funnel-chart";

describe("FunnelChart", () => {
  it("shows the empty prompt when no applications", () => {
    render(
      <FunnelChart funnel={{ applied: 0, interviewing: 0, offer: 0, rejected: 0 }} />,
    );
    expect(screen.getByText(/Start tracking applications/i)).toBeInTheDocument();
  });

  it("renders the rejected footnote when there is data", () => {
    render(
      <FunnelChart funnel={{ applied: 10, interviewing: 3, offer: 1, rejected: 2 }} />,
    );
    expect(screen.getByText(/2 rejected/)).toBeInTheDocument();
  });
});
