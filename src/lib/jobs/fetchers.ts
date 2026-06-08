import type { BoardConfig } from "./boards.config";

export interface NormalizedJob {
  externalId: string;
  company: string;
  title: string;
  location: string | null;
  url: string | null;
  descriptionText: string;
  postedAt: Date | null;
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
    return (data.jobs ?? []).map((j: any) => ({
      externalId: `greenhouse:${cfg.slug}:${j.id}`,
      company: cfg.company,
      title: j.title,
      location: j.location?.name ?? null,
      url: j.absolute_url ?? null,
      descriptionText: stripHtml(j.content ?? ""),
      postedAt: j.updated_at ? new Date(j.updated_at) : null,
    }));
  }

  if (cfg.provider === "lever") {
    const res = await f(
      `https://api.lever.co/v0/postings/${cfg.slug}?mode=json`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data ?? []).map((j: any) => ({
      externalId: `lever:${cfg.slug}:${j.id}`,
      company: cfg.company,
      title: j.text,
      location: j.categories?.location ?? null,
      url: j.hostedUrl ?? null,
      descriptionText: stripHtml(j.descriptionPlain ?? j.description ?? ""),
      postedAt: j.createdAt ? new Date(j.createdAt) : null,
    }));
  }

  // ashby
  const res = await f(
    `https://api.ashbyhq.com/posting-api/job-board/${cfg.slug}?includeCompensation=false`
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.jobs ?? []).map((j: any) => ({
    externalId: `ashby:${cfg.slug}:${j.id}`,
    company: cfg.company,
    title: j.title,
    location: j.location ?? null,
    url: j.jobUrl ?? null,
    descriptionText: stripHtml(j.descriptionPlain ?? j.descriptionHtml ?? ""),
    postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
  }));
}
