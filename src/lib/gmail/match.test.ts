import { describe, it, expect } from "vitest";
import { matchApplication, type AppCandidate } from "@/lib/gmail/match";

const candidates: AppCandidate[] = [
  { applicationId: "app-acme", company: "Acme Inc.", status: "applied" },
  { applicationId: "app-globex", company: "Globex Corporation", status: "saved" },
];

describe("matchApplication", () => {
  it("matches on classified company name, ignoring legal suffixes", () => {
    const m = matchApplication({ fromEmail: "no-reply@greenhouse.io", company: "Acme" }, candidates);
    expect(m.applicationId).toBe("app-acme");
    expect(m.currentStatus).toBe("applied");
  });

  it("matches on a direct-company sender domain when classified company is null", () => {
    const m = matchApplication({ fromEmail: "careers@globex.com", company: null }, candidates);
    expect(m.applicationId).toBe("app-globex");
  });

  it("returns null when nothing matches", () => {
    const m = matchApplication({ fromEmail: "x@initech.com", company: "Initech" }, candidates);
    expect(m.applicationId).toBeNull();
    expect(m.currentStatus).toBeNull();
  });

  it("does not match on a generic ATS sender domain", () => {
    const m = matchApplication({ fromEmail: "no-reply@lever.co", company: null }, candidates);
    expect(m.applicationId).toBeNull();
  });
});
