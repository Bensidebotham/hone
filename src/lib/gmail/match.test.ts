import { describe, it, expect } from "vitest";
import { matchApplication, type AppCandidate } from "@/lib/gmail/match";

const candidates: AppCandidate[] = [
  { applicationId: "app-acme", company: "Acme Inc.", title: "SWE", status: "applied" },
  { applicationId: "app-globex", company: "Globex Corporation", title: "SWE", status: "saved" },
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

  it("does not false-match a candidate whose name normalizes to empty", () => {
    // "Co." strips to "" — must not become a wildcard that matches everything.
    const degenerate: AppCandidate[] = [{ applicationId: "app-co", company: "Co.", title: "X", status: "applied" }];
    const m = matchApplication({ fromEmail: "no-reply@greenhouse.io", company: "Initech" }, degenerate);
    expect(m.applicationId).toBeNull();
  });
});

describe("matchApplication — sender domains", () => {
  const roblox: AppCandidate[] = [{ applicationId: "app-roblox", company: "Roblox", title: "SWE", status: "applied" }];

  it("uses the registrable domain, not the first label", () => {
    const m = matchApplication({ fromEmail: "Roblox Assessment <noreply@email.roblox.com>", company: null }, roblox);
    expect(m.applicationId).toBe("app-roblox");
  });

  it("treats ATS subdomains as generic", () => {
    const hire: AppCandidate[] = [{ applicationId: "app-hire", company: "Hire", title: "SWE", status: "applied" }];
    expect(matchApplication({ fromEmail: "no-reply@hire.lever.co", company: null }, hire).applicationId).toBeNull();
  });

  it("handles two-letter country SLDs", () => {
    const acme: AppCandidate[] = [{ applicationId: "app-acme-uk", company: "Acme", title: "SWE", status: "applied" }];
    expect(matchApplication({ fromEmail: "jobs@careers.acme.co.uk", company: null }, acme).applicationId).toBe("app-acme-uk");
  });
});

describe("matchApplication — company names", () => {
  it("does not let a short name contain-match a longer one", () => {
    const apps: AppCandidate[] = [{ applicationId: "app-mb", company: "Metabase", title: "SWE", status: "applied" }];
    expect(matchApplication({ fromEmail: "x@greenhouse.io", company: "Meta" }, apps).applicationId).toBeNull();
  });

  it("still contain-matches names of 5+ characters", () => {
    const apps: AppCandidate[] = [{ applicationId: "app-jpm", company: "JPMorgan Chase & Co.", title: "SWE", status: "applied" }];
    expect(matchApplication({ fromEmail: "x@oracle.com", company: "JPMorgan" }, apps).applicationId).toBe("app-jpm");
  });

  it("prefers the same-company app whose title overlaps the email's", () => {
    const apps: AppCandidate[] = [
      { applicationId: "newer", company: "Stripe", title: "Software Engineer, New Grad", status: "applied" },
      { applicationId: "older", company: "Stripe", title: "Data Scientist Intern", status: "applied" },
    ];
    expect(matchApplication({ fromEmail: "x@stripe.com", company: "Stripe", title: "Data Scientist" }, apps).applicationId).toBe("older");
  });

  it("falls back to the first (newest) same-company app without a title hint", () => {
    const apps: AppCandidate[] = [
      { applicationId: "newer", company: "Stripe", title: "A", status: "applied" },
      { applicationId: "older", company: "Stripe", title: "B", status: "applied" },
    ];
    expect(matchApplication({ fromEmail: "x@stripe.com", company: "Stripe" }, apps).applicationId).toBe("newer");
  });
});
