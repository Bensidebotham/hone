import type { NormalizedJob } from "./fetchers";
import type { EmploymentType } from "./enrich";

export interface AggregatorSource {
  name: string;
  url: string;
  employmentType: EmploymentType;
  level: "junior" | "intern";
  externalIdPrefix: string;
}

export interface AggregatorJob extends NormalizedJob {
  active: boolean;
  employmentType: EmploymentType;
  level: "junior" | "intern";
}

/** Identify ourselves politely to the source host. */
export const AGGREGATOR_USER_AGENT =
  "hone-job-suite/1.0 (+https://github.com/SimplifyJobs; personal new-grad job board)";

/** Configured open-source new-grad / internship lists. Add Summer2027-Internships when it exists. */
export const AGGREGATOR_SOURCES: AggregatorSource[] = [
  {
    name: "Simplify New-Grad",
    url: "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
    employmentType: "fulltime",
    level: "junior",
    externalIdPrefix: "simplify:newgrad",
  },
  {
    name: "Simplify Summer 2026 Internships",
    url: "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json",
    employmentType: "internship",
    level: "intern",
    externalIdPrefix: "simplify:intern",
  },
];

export function parseListings(raw: unknown, src: AggregatorSource): AggregatorJob[] {
  if (!Array.isArray(raw)) return [];
  const out: AggregatorJob[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const j = item as Record<string, unknown>;
    if (j.is_visible !== true) continue;
    if (typeof j.id !== "string" || typeof j.title !== "string" || typeof j.company_name !== "string") continue;

    const locations = Array.isArray(j.locations)
      ? (j.locations as unknown[]).filter((l): l is string => typeof l === "string")
      : [];

    out.push({
      externalId: `${src.externalIdPrefix}:${j.id}`,
      company: j.company_name,
      title: j.title,
      location: locations.length ? locations.join(" · ") : null,
      url: typeof j.url === "string" && j.url ? j.url : null,
      descriptionText: "",
      descriptionHtml: "",
      postedAt: typeof j.date_posted === "number" ? new Date(j.date_posted * 1000) : null,
      salary: null,
      active: j.active !== false,
      employmentType: src.employmentType,
      level: src.level,
    });
  }
  return out;
}
