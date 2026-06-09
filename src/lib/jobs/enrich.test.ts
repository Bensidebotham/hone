import { describe, it, expect } from "vitest";
import { parseLocation } from "./enrich";
import { classifyRole } from "./enrich";
import { extractTechTags } from "./enrich";

describe("parseLocation", () => {
  it("detects US from a state code", () => {
    expect(parseLocation("New York, NY")).toEqual({ country: "US", isRemote: false });
  });
  it("detects US from a known city without state", () => {
    expect(parseLocation("San Francisco")).toEqual({ country: "US", isRemote: false });
  });
  it("detects US from an explicit marker", () => {
    expect(parseLocation("Austin, United States")).toEqual({ country: "US", isRemote: false });
  });
  it("flags remote and still resolves US", () => {
    expect(parseLocation("Remote (US)")).toEqual({ country: "US", isRemote: true });
  });
  it("flags remote with no resolvable country", () => {
    expect(parseLocation("Remote")).toEqual({ country: null, isRemote: true });
  });
  it("returns null country for a foreign location", () => {
    expect(parseLocation("London, UK")).toEqual({ country: null, isRemote: false });
  });
  it("returns null country for ambiguous text", () => {
    expect(parseLocation("Worldwide")).toEqual({ country: null, isRemote: false });
  });
  it("handles null input", () => {
    expect(parseLocation(null)).toEqual({ country: null, isRemote: false });
  });
});

describe("classifyRole", () => {
  it("classifies a specialized frontend title", () => {
    expect(classifyRole("Senior Frontend Engineer")).toEqual({ roleCategory: "frontend", level: "senior" });
  });
  it("classifies ML over generic engineer", () => {
    expect(classifyRole("Machine Learning Engineer")).toEqual({ roleCategory: "ml-ai", level: null });
  });
  it("falls back to fullstack for a generic software title", () => {
    expect(classifyRole("Software Engineer")).toEqual({ roleCategory: "fullstack", level: null });
  });
  it("buckets a non-software title as other", () => {
    expect(classifyRole("Account Executive")).toEqual({ roleCategory: "other", level: null });
  });
  it("detects intern level", () => {
    expect(classifyRole("Backend Engineering Intern")).toEqual({ roleCategory: "backend", level: "intern" });
  });
  it("detects staff before senior", () => {
    expect(classifyRole("Staff Software Engineer")).toEqual({ roleCategory: "fullstack", level: "staff" });
  });
});

describe("extractTechTags", () => {
  it("extracts canonical tech names, deduped", () => {
    const tags = extractTechTags(
      "Senior React Engineer",
      "You will work with React, TypeScript and Node.js on AWS."
    );
    expect(tags).toEqual(expect.arrayContaining(["React", "TypeScript", "Node.js", "AWS"]));
    expect(tags.filter((t) => t === "React")).toHaveLength(1);
  });
  it("does not match 'go' inside another word", () => {
    expect(extractTechTags("Ongoing project work", "")).not.toContain("Go");
  });
  it("matches C++ and C# despite special chars", () => {
    const tags = extractTechTags("C++ / C# Developer", "");
    expect(tags).toEqual(expect.arrayContaining(["C++", "C#"]));
  });
  it("returns an empty array when nothing matches", () => {
    expect(extractTechTags("Account Manager", "Manage accounts.")).toEqual([]);
  });
});

import { enrichJob } from "./enrich";

describe("enrichJob", () => {
  it("produces the full enrichment object", () => {
    const result = enrichJob({
      title: "Senior Frontend Engineer",
      location: "New York, NY",
      descriptionText: "Build with React and TypeScript. $150k – $190k.",
      salary: "$150K–$190K",
    });
    expect(result).toEqual({
      country: "US",
      isRemote: false,
      roleCategory: "frontend",
      level: "senior",
      techTags: expect.arrayContaining(["React", "TypeScript"]),
      salaryMin: 150000,
      salaryMax: 190000,
    });
  });

  it("derives salary from description when salary field is absent", () => {
    const result = enrichJob({
      title: "Backend Engineer",
      location: "Remote",
      descriptionText: "Compensation: $120,000 to $160,000.",
      salary: null,
    });
    expect(result.salaryMin).toBe(120000);
    expect(result.salaryMax).toBe(160000);
    expect(result.isRemote).toBe(true);
    expect(result.country).toBeNull();
  });
});
