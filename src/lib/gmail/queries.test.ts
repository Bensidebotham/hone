import { describe, it, expect } from "vitest";
import {
  buildSearchQueries, isGenericSenderDomain, syncWindowStart, SYNC_FLOOR,
} from "@/lib/gmail/queries";

const after = new Date("2026-09-01T00:00:00Z");
const epoch = Math.floor(after.getTime() / 1000);

describe("buildSearchQueries", () => {
  it("scopes every query to the window with an epoch after:", () => {
    const qs = buildSearchQueries({ after, trackedCompanies: [] });
    expect(qs.length).toBeGreaterThanOrEqual(6);
    for (const q of qs) expect(q.endsWith(` after:${epoch}`)).toBe(true);
  });

  it("covers ATS senders, confirmations, rejections, interviews and assessments", () => {
    const all = buildSearchQueries({ after, trackedCompanies: [] }).join("\n");
    expect(all).toContain("from:(greenhouse.io OR");
    expect(all).toContain("cloud.oracle.com");
    expect(all).toContain('"thank you for applying"');
    expect(all).toContain('"not moving forward"');
    expect(all).toContain('"invite you to interview"');
    expect(all).toContain("codesignal.com");
    expect(all).toContain('"online assessment"');
  });

  it("sweeps tracked companies in chunks of 10 with a job-word clause", () => {
    const companies = Array.from({ length: 12 }, (_, i) => `Co${i}`);
    const sweeps = buildSearchQueries({ after, trackedCompanies: companies })
      .filter((q) => q.includes('"Co0"') || q.includes('"Co10"'));
    expect(sweeps).toHaveLength(2);
    expect(sweeps[0]).toContain("(application OR applied OR interview OR assessment OR candidate OR recruiter");
  });

  it("dedupes tracked companies case-insensitively and strips quotes", () => {
    const qs = buildSearchQueries({ after, trackedCompanies: ["Acme", "acme", 'The "Best" Co', "  "] });
    const sweep = qs.find((q) => q.includes('"Acme"'))!;
    expect(sweep.match(/"acme"/gi)).toHaveLength(1);
    expect(sweep).toContain('"The Best Co"');
    expect(sweep).not.toContain('""');
  });

  it("emits no sweep query when nothing is tracked", () => {
    const qs = buildSearchQueries({ after, trackedCompanies: [] });
    expect(qs.some((q) => q.includes("recruiter OR"))).toBe(false);
  });
});

describe("isGenericSenderDomain", () => {
  it("matches ATS, assessment and webmail domains including subdomains", () => {
    expect(isGenericSenderDomain("hire.lever.co")).toBe(true);
    expect(isGenericSenderDomain("us.greenhouse-mail.io")).toBe(true);
    expect(isGenericSenderDomain("workflow.mail.us2.cloud.oracle.com")).toBe(true);
    expect(isGenericSenderDomain("otp.workday.com")).toBe(true);
    expect(isGenericSenderDomain("codesignal.com")).toBe(true);
    expect(isGenericSenderDomain("gmail.com")).toBe(true);
  });
  it("does not match company domains or lookalikes", () => {
    expect(isGenericSenderDomain("roblox.com")).toBe(false);
    expect(isGenericSenderDomain("notlever.co")).toBe(false);
  });
});

describe("syncWindowStart", () => {
  const now = new Date("2026-09-23T12:00:00Z");
  it("overlaps the last sync by 2 days", () => {
    expect(syncWindowStart(new Date("2026-09-20T12:00:00Z"), now))
      .toEqual(new Date("2026-09-18T12:00:00Z"));
  });
  it("looks back 30 days (+2 overlap) with no prior sync", () => {
    expect(syncWindowStart(null, now)).toEqual(new Date("2026-08-22T12:00:00Z"));
  });
  it("never reaches before the floor", () => {
    expect(syncWindowStart(new Date("2026-06-01T00:00:00Z"), now)).toEqual(SYNC_FLOOR);
  });
});
