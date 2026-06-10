import { describe, it, expect } from "vitest";
import { parseListings, type AggregatorSource } from "./aggregator";

const NEWGRAD: AggregatorSource = {
  name: "Simplify New-Grad", url: "https://example/listings.json",
  employmentType: "fulltime", level: "junior", externalIdPrefix: "simplify:newgrad",
};

describe("parseListings", () => {
  it("maps a visible listing to a NormalizedJob with authoritative level/employmentType", () => {
    const raw = [{
      id: "abc", company_name: "Acme", title: "Software Engineer, New Grad",
      locations: ["San Jose, CA", "Remote in USA"], url: "https://acme.com/jobs/1",
      date_posted: 1760362966, active: true, is_visible: true, category: "Software Engineering",
    }];
    const [j] = parseListings(raw, NEWGRAD);
    expect(j).toMatchObject({
      externalId: "simplify:newgrad:abc",
      company: "Acme",
      title: "Software Engineer, New Grad",
      location: "San Jose, CA · Remote in USA",
      url: "https://acme.com/jobs/1",
      descriptionText: "",
      descriptionHtml: "",
      salary: null,
      active: true,
      employmentType: "fulltime",
      level: "junior",
    });
    expect(j.postedAt?.getTime()).toBe(1760362966 * 1000);
  });

  it("skips entries where is_visible is not true", () => {
    const raw = [{ id: "x", company_name: "A", title: "T", locations: [], url: "u", date_posted: 1, is_visible: false, active: true }];
    expect(parseListings(raw, NEWGRAD)).toHaveLength(0);
  });

  it("carries active=false through (for feed exclusion)", () => {
    const raw = [{ id: "x", company_name: "A", title: "T", locations: ["NYC"], url: "u", date_posted: 1, is_visible: true, active: false }];
    expect(parseListings(raw, NEWGRAD)[0].active).toBe(false);
  });

  it("tolerates missing/garbage input", () => {
    expect(parseListings(null, NEWGRAD)).toEqual([]);
    expect(parseListings([{ is_visible: true }], NEWGRAD)).toEqual([]); // missing id/title/company
    expect(parseListings([42, "x", null], NEWGRAD)).toEqual([]);
  });

  it("null location when no valid locations", () => {
    const raw = [{ id: "x", company_name: "A", title: "T", locations: [], url: "u", date_posted: 1, is_visible: true, active: true }];
    expect(parseListings(raw, NEWGRAD)[0].location).toBeNull();
  });
});
