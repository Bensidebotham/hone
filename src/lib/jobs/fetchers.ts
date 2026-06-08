import type { BoardConfig } from "./boards.config";
import { parseSalary } from "./salary";

export interface NormalizedJob {
  externalId: string;
  company: string;
  title: string;
  location: string | null;
  url: string | null;
  descriptionText: string;
  postedAt: Date | null;
  salary: string | null;
}

interface Opts {
  fetchFn?: typeof fetch;
}

const stripHtml = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export async function fetchBoard(
  cfg: BoardConfig,
  opts: Opts = {}
): Promise<NormalizedJob[]> {
  const f = opts.fetchFn ?? fetch;

  if (cfg.provider === "greenhouse") {
    const res = await f(
      `https://boards-api.greenhouse.io/v1/boards/${cfg.slug}/jobs?content=true`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs ?? []).map((j: any) => {
      const descriptionText = stripHtml(j.content ?? "");
      return {
        externalId: `greenhouse:${cfg.slug}:${j.id}`,
        company: cfg.company,
        title: j.title,
        location: j.location?.name ?? null,
        url: j.absolute_url ?? null,
        descriptionText,
        postedAt: j.updated_at ? new Date(j.updated_at) : null,
        salary: parseSalary(descriptionText),
      };
    });
  }

  if (cfg.provider === "lever") {
    const res = await f(
      `https://api.lever.co/v0/postings/${cfg.slug}?mode=json`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data ?? []).map((j: any) => {
      const descriptionText = stripHtml(j.descriptionPlain ?? j.description ?? "");
      return {
        externalId: `lever:${cfg.slug}:${j.id}`,
        company: cfg.company,
        title: j.text,
        location: j.categories?.location ?? null,
        url: j.hostedUrl ?? null,
        descriptionText,
        postedAt: j.createdAt ? new Date(j.createdAt) : null,
        salary: parseSalary(descriptionText),
      };
    });
  }

  // ashby
  const res = await f(
    `https://api.ashbyhq.com/posting-api/job-board/${cfg.slug}?includeCompensation=true`
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.jobs ?? []).map((j: any) => {
    const descriptionText = stripHtml(
      j.descriptionPlain ?? j.descriptionHtml ?? ""
    );
    // Prefer Ashby's human-readable compensation summary; fall back to description parsing.
    // Guard: compensationTierSummary may be a non-string (object/number) on some responses.
    const tierSummary = j.compensation?.compensationTierSummary;
    const summaryStr = typeof tierSummary === "string" ? tierSummary : null;
    // Normalize the Ashby string through parseSalary so format matches our output (e.g.
    // "$120K – $160K" → "$120K–$160K"); fall back to raw summary if parseSalary can't parse it.
    const salary: string | null =
      (summaryStr ? parseSalary(summaryStr) ?? summaryStr : null) ??
      parseSalary(descriptionText);
    return {
      externalId: `ashby:${cfg.slug}:${j.id}`,
      company: cfg.company,
      title: j.title,
      location: j.location ?? null,
      url: j.jobUrl ?? null,
      descriptionText,
      postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
      salary,
    };
  });
}
