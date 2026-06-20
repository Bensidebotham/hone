import { describe, it, expect } from "vitest";
import { toBrowserJob } from "@/components/job-browser-types";
import type { JobListRow } from "@/lib/jobs/constants";

const row: JobListRow = {
  id: "j1",
  title: "Engineer",
  company: "Acme",
  location: "NYC",
  url: "https://acme.example",
  salary: "$150k",
  postedAt: new Date("2026-01-01T00:00:00Z"),
  roleCategory: null,
  level: null,
  techTags: ["ts"],
  source: "ats",
};

describe("toBrowserJob", () => {
  it("does not carry the heavy description fields into the list payload", () => {
    const job = toBrowserJob(row);
    expect(job).not.toHaveProperty("descriptionText");
    expect(job).not.toHaveProperty("descriptionHtml");
  });

  it("flags only aggregator listings as external (apply-out)", () => {
    expect(toBrowserJob({ ...row, source: "aggregator" }).external).toBe(true);
    expect(toBrowserJob({ ...row, source: "ats" }).external).toBe(false);
    expect(toBrowserJob({ ...row, source: "paste" }).external).toBe(false);
  });

  it("serializes postedAt to an ISO string and passes through list fields", () => {
    const job = toBrowserJob(row);
    expect(job.postedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(job).toMatchObject({
      id: "j1",
      title: "Engineer",
      company: "Acme",
      location: "NYC",
      url: "https://acme.example",
      salary: "$150k",
      techTags: ["ts"],
    });
  });

  it("handles a null postedAt", () => {
    expect(toBrowserJob({ ...row, postedAt: null }).postedAt).toBeNull();
  });
});
