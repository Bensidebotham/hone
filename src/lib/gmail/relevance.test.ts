import { describe, it, expect } from "vitest";
import { isJobRelevant } from "@/lib/gmail/relevance";

describe("isJobRelevant", () => {
  it("accepts known ATS sender domains", () => {
    expect(isJobRelevant({ fromEmail: "no-reply@greenhouse.io", subject: "Hi" })).toBe(true);
    expect(isJobRelevant({ fromEmail: "jobs@hire.lever.co", subject: "x" })).toBe(true);
    expect(isJobRelevant({ fromEmail: "a@us.greenhouse-mail.io", subject: "x" })).toBe(true);
  });

  it("accepts job keywords in the subject regardless of sender", () => {
    expect(isJobRelevant({ fromEmail: "careers@acme.com", subject: "Your application to Acme" })).toBe(true);
    expect(isJobRelevant({ fromEmail: "x@y.com", subject: "Unfortunately, an update on your candidacy" })).toBe(true);
    expect(isJobRelevant({ fromEmail: "x@y.com", subject: "Next steps for your interview" })).toBe(true);
  });

  it("rejects unrelated mail", () => {
    expect(isJobRelevant({ fromEmail: "news@substack.com", subject: "Your weekly digest" })).toBe(false);
    expect(isJobRelevant({ fromEmail: "receipts@amazon.com", subject: "Your order shipped" })).toBe(false);
  });

  it("is case-insensitive and tolerates display-name From headers", () => {
    expect(isJobRelevant({ fromEmail: "Acme Recruiting <no-reply@GREENHOUSE.IO>", subject: "x" })).toBe(true);
  });
});
