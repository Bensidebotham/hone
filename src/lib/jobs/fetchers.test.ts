import { describe, it, expect, vi } from "vitest";
import { fetchBoard, type NormalizedJob } from "@/lib/jobs/fetchers";

describe("fetchBoard greenhouse", () => {
  it("normalizes greenhouse jobs", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobs: [
          {
            id: 123,
            title: "SWE",
            absolute_url: "http://x/123",
            location: { name: "NYC" },
            content: "<p>Build things</p>",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    });
    const jobs: NormalizedJob[] = await fetchBoard(
      { provider: "greenhouse", slug: "acme", company: "Acme" },
      { fetchFn: fakeFetch as any }
    );
    expect(jobs[0]).toMatchObject({
      externalId: "greenhouse:acme:123",
      company: "Acme",
      title: "SWE",
      location: "NYC",
      url: "http://x/123",
    });
    expect(jobs[0].descriptionText).toContain("Build things");
  });
});

describe("fetchBoard lever", () => {
  it("normalizes lever jobs", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "lever-abc-123",
          text: "Staff Engineer",
          categories: { location: "Remote" },
          hostedUrl: "https://jobs.lever.co/netflix/lever-abc-123",
          descriptionPlain: "Work on streaming infrastructure.",
          createdAt: 1700000000000,
        },
      ],
    });
    const jobs: NormalizedJob[] = await fetchBoard(
      { provider: "lever", slug: "netflix", company: "Netflix" },
      { fetchFn: fakeFetch as any }
    );
    expect(jobs[0]).toMatchObject({
      externalId: "lever:netflix:lever-abc-123",
      company: "Netflix",
      title: "Staff Engineer",
      location: "Remote",
      url: "https://jobs.lever.co/netflix/lever-abc-123",
    });
  });
});

describe("fetchBoard ashby", () => {
  it("normalizes ashby jobs", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobs: [
          {
            id: "ashby-xyz-456",
            title: "Product Designer",
            location: "New York, NY",
            jobUrl: "https://jobs.ashbyhq.com/ramp/ashby-xyz-456",
            descriptionPlain: "Design great products.",
            publishedAt: "2026-02-01T00:00:00Z",
          },
        ],
      }),
    });
    const jobs: NormalizedJob[] = await fetchBoard(
      { provider: "ashby", slug: "ramp", company: "Ramp" },
      { fetchFn: fakeFetch as any }
    );
    expect(jobs[0]).toMatchObject({
      externalId: "ashby:ramp:ashby-xyz-456",
      company: "Ramp",
      title: "Product Designer",
      location: "New York, NY",
      url: "https://jobs.ashbyhq.com/ramp/ashby-xyz-456",
    });
  });

  it("maps compensationTierSummary to salary when present", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobs: [
          {
            id: "ashby-comp-789",
            title: "Senior Engineer",
            location: "Remote",
            jobUrl: "https://jobs.ashbyhq.com/acme/ashby-comp-789",
            descriptionPlain: "Build cool things.",
            publishedAt: "2026-03-01T00:00:00Z",
            compensation: {
              compensationTierSummary: "$120K – $160K",
            },
          },
        ],
      }),
    });
    const jobs: NormalizedJob[] = await fetchBoard(
      { provider: "ashby", slug: "acme", company: "Acme" },
      { fetchFn: fakeFetch as any }
    );
    expect(jobs[0].salary).toBe("$120K – $160K");
  });

  it("falls back to parseSalary on description when no compensationTierSummary", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobs: [
          {
            id: "ashby-nocomp-111",
            title: "Data Engineer",
            location: "Austin, TX",
            jobUrl: "https://jobs.ashbyhq.com/acme/ashby-nocomp-111",
            descriptionPlain: "Pay range: $130,000 - $155,000 per year.",
            publishedAt: "2026-04-01T00:00:00Z",
          },
        ],
      }),
    });
    const jobs: NormalizedJob[] = await fetchBoard(
      { provider: "ashby", slug: "acme", company: "Acme" },
      { fetchFn: fakeFetch as any }
    );
    expect(jobs[0].salary).toBe("$130K–$155K");
  });
});

describe("fetchBoard error handling", () => {
  it("returns empty array when response is not ok", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    });
    const jobs: NormalizedJob[] = await fetchBoard(
      { provider: "greenhouse", slug: "acme", company: "Acme" },
      { fetchFn: fakeFetch as any }
    );
    expect(jobs).toEqual([]);
  });
});
