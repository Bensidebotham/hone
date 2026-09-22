import { describe, it, expect } from "vitest";
import { decideEmailAction, canAutoMove, AUTO_APPLY_THRESHOLD, ROLE_PLACEHOLDER } from "@/lib/gmail/decide";
import type { Classification } from "@/lib/gmail/classify";

const base: Classification = { status: "rejected", confidence: 0.95, company: "Acme", title: "SWE", reason: "x" };
const unmatched = { applicationId: null, currentStatus: null };

describe("decideEmailAction — matched", () => {
  it("auto-applies a confident forward move", () => {
    expect(decideEmailAction(base, { applicationId: "a1", currentStatus: "applied" }))
      .toEqual({ action: "auto_apply", applicationId: "a1", fromStatus: "applied", toStatus: "rejected" });
  });

  it("suggests a low-confidence forward move", () => {
    expect(decideEmailAction({ ...base, confidence: 0.5 }, { applicationId: "a1", currentStatus: "applied" }))
      .toEqual({ action: "suggest_status", applicationId: "a1", suggestedStatus: "rejected" });
  });

  it("ignores when already in that status", () => {
    expect(decideEmailAction(base, { applicationId: "a1", currentStatus: "rejected" }))
      .toEqual({ action: "ignore", reason: "already in status", applicationId: "a1" });
  });

  it("ignores a backwards move (old confirmation after an interview)", () => {
    const d = decideEmailAction({ ...base, status: "applied" }, { applicationId: "a1", currentStatus: "interviewing" });
    expect(d).toEqual({ action: "ignore", reason: "would regress status", applicationId: "a1" });
  });
});

describe("decideEmailAction — unmatched", () => {
  it("creates a confident, named application", () => {
    expect(decideEmailAction({ ...base, status: "applied" }, unmatched))
      .toEqual({ action: "create", status: "applied", company: "Acme", title: "SWE" });
  });

  it("creates even without a title", () => {
    expect(decideEmailAction({ ...base, title: null }, unmatched))
      .toEqual({ action: "create", status: "rejected", company: "Acme", title: null });
  });

  it("suggests below the threshold", () => {
    expect(decideEmailAction({ ...base, confidence: 0.79 }, unmatched))
      .toEqual({ action: "suggest_new", suggestedStatus: "rejected", company: "Acme", title: "SWE" });
  });

  it("suggests instead of creating when the company is missing or blank", () => {
    expect(decideEmailAction({ ...base, company: null }, unmatched).action).toBe("suggest_new");
    expect(decideEmailAction({ ...base, company: "   " }, unmatched).action).toBe("suggest_new");
  });

  it("trims the company it creates", () => {
    const d = decideEmailAction({ ...base, company: "  Acme " }, unmatched);
    expect(d).toMatchObject({ action: "create", company: "Acme" });
  });
});

describe("decideEmailAction — none", () => {
  it("ignores status none, keeping any match for the ledger", () => {
    expect(decideEmailAction({ ...base, status: "none" }, unmatched))
      .toEqual({ action: "ignore", reason: "not an application email", applicationId: null });
  });
});

describe("canAutoMove", () => {
  it("moves forward only", () => {
    expect(canAutoMove("saved", "applied")).toBe(true);
    expect(canAutoMove("applied", "interviewing")).toBe(true);
    expect(canAutoMove("interviewing", "offer")).toBe(true);
    expect(canAutoMove("interviewing", "applied")).toBe(false);
  });
  it("allows rejection from any open status", () => {
    expect(canAutoMove("applied", "rejected")).toBe(true);
    expect(canAutoMove("interviewing", "rejected")).toBe(true);
  });
  it("never moves out of rejected or offer", () => {
    expect(canAutoMove("rejected", "interviewing")).toBe(false);
    expect(canAutoMove("offer", "rejected")).toBe(false);
  });
});

it("constants", () => {
  expect(AUTO_APPLY_THRESHOLD).toBe(0.8);
  expect(ROLE_PLACEHOLDER).toBe("Role not specified");
});
