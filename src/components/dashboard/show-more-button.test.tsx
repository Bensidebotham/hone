import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ShowMoreButton } from "@/components/dashboard/show-more-button";

describe("ShowMoreButton", () => {
  it("shows remaining count when collapsed and toggles label on click", () => {
    const onToggle = vi.fn();
    render(<ShowMoreButton expanded={false} remaining={6} onToggle={onToggle} />);
    const btn = screen.getByRole("button", { name: /show 6 more/i });
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("shows 'Show less' when expanded", () => {
    render(<ShowMoreButton expanded={true} remaining={6} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: /show less/i })).toBeInTheDocument();
  });
});
