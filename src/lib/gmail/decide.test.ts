import { describe, it, expect } from "vitest";
import { decideEmailAction, AUTO_APPLY_THRESHOLD } from "@/lib/gmail/decide";
import type { Classification } from "@/lib/gmail/classify";

const base: Classification = { status: "rejected", confidence: 0.95, company: "Acme", title: "SWE", reason: "x" };

describe("decideEmailAction", () => {
  it("auto-applies a matched, high-confidence status change", () => {
    const d = decideEmailAction(base, { applicationId: "a1", currentStatus: "applied" });
    expect(d).toEqual({ action: "auto_apply", applicationId: "a1", fromStatus: "applied", toStatus: "rejected" });
  });

  it("suggests when matched but below the confidence threshold", () => {
    const d = decideEmailAction({ ...base, confidence: 0.5 }, { applicationId: "a1", currentStatus: "applied" });
    expect(d).toEqual({ action: "suggest_status", applicationId: "a1", suggestedStatus: "rejected" });
  });

  it("skips when the matched application is already in that status", () => {
    const d = decideEmailAction(base, { applicationId: "a1", currentStatus: "rejected" });
    expect(d.action).toBe("skip");
  });

  it("suggests a new application when unmatched (any confidence)", () => {
    const d = decideEmailAction(base, { applicationId: null, currentStatus: null });
    expect(d).toEqual({ action: "suggest_new", suggestedStatus: "rejected", company: "Acme", title: "SWE" });
  });

  it("skips status 'none'", () => {
    const d = decideEmailAction({ ...base, status: "none" }, { applicationId: null, currentStatus: null });
    expect(d.action).toBe("skip");
  });

  it("threshold is 0.8", () => {
    expect(AUTO_APPLY_THRESHOLD).toBe(0.8);
  });
});
