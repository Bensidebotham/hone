import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders the title text", () => {
    render(<EmptyState title="No data here" />);
    expect(screen.getByText("No data here")).toBeInTheDocument();
  });

  it("renders the message when provided", () => {
    render(<EmptyState title="Title" message="This is a message" />);
    expect(screen.getByText("This is a message")).toBeInTheDocument();
  });

  it("renders an action element when provided", () => {
    render(<EmptyState title="Title" action={<button>Click me</button>} />);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("does not render the message when omitted", () => {
    render(<EmptyState title="Title" />);
    expect(screen.queryByText(/this is a message/i)).not.toBeInTheDocument();
  });
});
