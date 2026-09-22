import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const undo = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/gmail/suggestions", () => ({
  confirmSuggestion: vi.fn(), dismissSuggestion: vi.fn(), undoAutoAdd: (...a: any) => undo(...a),
}));
vi.mock("@/components/dashboard/email-preview-dialog", () => ({
  EmailPreviewDialog: ({ subject }: { subject: string }) => <span>{subject}</span>,
}));

import { SuggestedUpdates } from "@/components/dashboard/suggested-updates";

const autoAdd = {
  id: "i1", messageId: "m1", threadId: "t1", fromEmail: "no-reply@ashbyhq.com",
  subject: "Thanks for applying to Valon", createdAt: new Date(),
  application: { id: "a1", company: "Valon", title: "Role not specified", status: "applied" as const },
};
const suggestion = {
  id: "s1", kind: "new_application", suggestedStatus: "applied" as const, company: "Glide", title: null,
  createdAt: new Date(), messageId: "m2", threadId: null, fromEmail: "x@glide.com", subject: "Hi",
  snippet: null, application: null,
};

describe("SuggestedUpdates", () => {
  it("shows auto-added applications with an Undo", () => {
    render(<SuggestedUpdates suggestions={[]} autoAdds={[autoAdd]} />);
    expect(screen.getByText("From your email")).toBeInTheDocument();
    expect(screen.getByText(/Valon — Role not specified/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(undo).toHaveBeenCalledWith("i1");
  });

  it("shows both groups when there is something in each", () => {
    render(<SuggestedUpdates suggestions={[suggestion]} autoAdds={[autoAdd]} />);
    expect(screen.getByText("Added")).toBeInTheDocument();
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
  });

  it("renders nothing when both are empty", () => {
    const { container } = render(<SuggestedUpdates suggestions={[]} autoAdds={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
