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
  it("returns non-null country for a foreign location", () => {
    expect(parseLocation("London, UK")).not.toEqual({ country: null, isRemote: false });
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

import { classifyEmploymentType, enrichJob } from "./enrich";

describe("classifyEmploymentType", () => {
  it("detects internships", () => {
    expect(classifyEmploymentType("Software Engineer Intern")).toBe("internship");
    expect(classifyEmploymentType("Summer 2027 Internship, Backend")).toBe("internship");
    expect(classifyEmploymentType("Engineering Co-Op")).toBe("internship");
    expect(classifyEmploymentType("Engineering Co op")).toBe("internship");
  });

  it("defaults everything else to fulltime", () => {
    expect(classifyEmploymentType("Software Engineer, New Grad")).toBe("fulltime");
    expect(classifyEmploymentType("Senior Backend Engineer")).toBe("fulltime");
    expect(classifyEmploymentType("")).toBe("fulltime");
    expect(classifyEmploymentType(null)).toBe("fulltime");
  });

  it("does not false-positive on substrings", () => {
    expect(classifyEmploymentType("Internal Tools Engineer")).toBe("fulltime");
    expect(classifyEmploymentType("Cooperative Systems Engineer")).toBe("fulltime");
  });

  it("enrichJob includes employmentType", () => {
    const e = enrichJob({ title: "Backend Engineer Intern", location: "Remote", descriptionText: "", salary: null });
    expect(e.employmentType).toBe("internship");
  });
});

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
      employmentType: "fulltime",
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

describe("classifyRole entry-level", () => {
  it("tags new-grad / associate / early-career as junior", () => {
    expect(classifyRole("New Grad Software Engineer").level).toBe("junior");
    expect(classifyRole("Associate Software Engineer").level).toBe("junior");
    expect(classifyRole("Early Career Backend Engineer").level).toBe("junior");
    expect(classifyRole("Software Engineer, University Graduate").level).toBe("junior");
  });
  it("tags numeric level I/II as junior", () => {
    expect(classifyRole("Software Engineer I").level).toBe("junior");
    expect(classifyRole("Backend Developer II").level).toBe("junior");
  });
  it("does not over-match (senior/intern unaffected)", () => {
    expect(classifyRole("Senior Software Engineer").level).toBe("senior");
    expect(classifyRole("Software Engineering Intern").level).toBe("intern");
    expect(classifyRole("Staff Engineer").level).toBe("staff");
  });
});

describe("parseLocation foreign detection", () => {
  it("flags foreign locations as INTL", () => {
    expect(parseLocation("London, UK")).toEqual({ country: "INTL", isRemote: false });
    expect(parseLocation("Bangalore, India")).toEqual({ country: "INTL", isRemote: false });
    expect(parseLocation("Remote - EMEA")).toEqual({ country: "INTL", isRemote: true });
    expect(parseLocation("Toronto, Canada")).toEqual({ country: "INTL", isRemote: false });
  });
  it("still resolves US before INTL", () => {
    expect(parseLocation("New York, NY")).toEqual({ country: "US", isRemote: false });
  });
  it("keeps bare Remote ambiguous (null)", () => {
    expect(parseLocation("Remote")).toEqual({ country: null, isRemote: true });
  });
});
