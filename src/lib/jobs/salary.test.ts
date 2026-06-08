import { describe, it, expect } from "vitest";
import { parseSalary } from "@/lib/jobs/salary";

describe("parseSalary", () => {
  // --- positive matches ---

  it("matches comma-separated range like $120,000 - $150,000", () => {
    expect(parseSalary("Base salary: $120,000 - $150,000 per year")).toBe(
      "$120K–$150K"
    );
  });

  it("matches k-range with en-dash like $120k–$150k", () => {
    expect(parseSalary("Compensation: $120k–$150k")).toBe("$120K–$150K");
  });

  it("matches k-range with hyphen like $120k-$150k", () => {
    expect(parseSalary("We pay $120k-$150k")).toBe("$120K–$150K");
  });

  it("matches bare 120-150k (no dollar sign)", () => {
    expect(parseSalary("Salary range: 120-150k")).toBe("$120K–$150K");
  });

  it("matches range with 'to' separator: $120k to $150k", () => {
    expect(parseSalary("Pay is $120k to $150k")).toBe("$120K–$150K");
  });

  it("matches single full figure $150,000", () => {
    expect(parseSalary("This role pays $150,000 annually")).toBe("$150K");
  });

  it("matches single k-figure $150k", () => {
    expect(parseSalary("Salary up to $150k")).toBe("$150K");
  });

  it("matches mixed: full thousands range $120,000–$150,000 (en-dash)", () => {
    expect(parseSalary("$120,000–$150,000")).toBe("$120K–$150K");
  });

  // --- no-match cases ---

  it("returns null when no salary pattern is present", () => {
    expect(parseSalary("We are looking for a talented engineer to join us.")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(parseSalary(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseSalary(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseSalary("")).toBeNull();
  });

  // --- false-positive guards ---

  it("does NOT match '401k' as a salary (no leading $, below minimum)", () => {
    expect(parseSalary("We offer 401k and health insurance.")).toBeNull();
  });

  it("does NOT match '5 years experience'", () => {
    expect(
      parseSalary("Requires 5 years of experience and strong communication skills.")
    ).toBeNull();
  });

  it("does NOT match small numbers like '10 days PTO'", () => {
    expect(parseSalary("Enjoy 10 days PTO and 401k matching.")).toBeNull();
  });

  it("does NOT match year numbers like 2024 in description", () => {
    expect(
      parseSalary(
        "Join our team in 2024 and work with 100 engineers across 3 offices."
      )
    ).toBeNull();
  });
});
