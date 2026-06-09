import type { BoardConfig } from "./boards.config";
import { parseSalary } from "./salary";
import { cleanDescription } from "./description";

export interface NormalizedJob {
  externalId: string;
  company: string;
  title: string;
  location: string | null;
  url: string | null;
  descriptionText: string;
  descriptionHtml: string;
  postedAt: Date | null;
  salary: string | null;
}

interface Opts {
  fetchFn?: typeof fetch;
}

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
      const { text, html } = cleanDescription(j.content ?? "");
      return {
        externalId: `greenhouse:${cfg.slug}:${j.id}`,
        company: cfg.company,
        title: j.title,
        location: j.location?.name ?? null,
        url: j.absolute_url ?? null,
        descriptionText: text,
        descriptionHtml: html,
        postedAt: j.updated_at ? new Date(j.updated_at) : null,
        salary: parseSalary(text),
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
      const { text, html } = cleanDescription(j.description ?? j.descriptionPlain ?? "");
      return {
        externalId: `lever:${cfg.slug}:${j.id}`,
        company: cfg.company,
        title: j.text,
        location: j.categories?.location ?? null,
        url: j.hostedUrl ?? null,
        descriptionText: text,
        descriptionHtml: html,
        postedAt: j.createdAt ? new Date(j.createdAt) : null,
        salary: parseSalary(text),
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
    const { text, html } = cleanDescription(j.descriptionHtml ?? j.descriptionPlain ?? "");
    // Prefer Ashby's human-readable compensation summary; fall back to description parsing.
    // Guard: compensationTierSummary may be a non-string (object/number) on some responses.
    const tierSummary = j.compensation?.compensationTierSummary;
    const summaryStr = typeof tierSummary === "string" ? tierSummary : null;
    // Normalize the Ashby string through parseSalary so format matches our output (e.g.
    // "$120K – $160K" → "$120K–$160K"); fall back to raw summary if parseSalary can't parse it.
    const salary: string | null =
      (summaryStr ? parseSalary(summaryStr) ?? summaryStr : null) ??
      parseSalary(text);
    return {
      externalId: `ashby:${cfg.slug}:${j.id}`,
      company: cfg.company,
      title: j.title,
      location: j.location ?? null,
      url: j.jobUrl ?? null,
      descriptionText: text,
      descriptionHtml: html,
      postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
      salary,
    };
  });
}
