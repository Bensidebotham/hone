import type { AppWithJob } from "@/app/(app)/applications/page";

export type TableFilter = "all" | "active" | "saved";
export type TableSort = "lastActivity" | "applied" | "company";

const ACTIVE_STATUSES = new Set(["applied", "interviewing", "offer"]);

/** Filter by status chip + free-text search over company and role title. */
export function filterApplications(
  apps: AppWithJob[],
  { search, filter }: { search: string; filter: TableFilter }
): AppWithJob[] {
  const q = search.trim().toLowerCase();
  return apps.filter((app) => {
    if (filter === "active" && !ACTIVE_STATUSES.has(app.status)) return false;
    if (filter === "saved" && app.status !== "saved") return false;
    if (q) {
      const hay = `${app.job.company} ${app.job.title}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Return a new, sorted array. Never mutates the input. */
export function sortApplications(apps: AppWithJob[], sort: TableSort): AppWithJob[] {
  const copy = [...apps];
  switch (sort) {
    case "company":
      return copy.sort((a, b) =>
        a.job.company.toLowerCase().localeCompare(b.job.company.toLowerCase())
      );
    case "applied":
      return copy.sort((a, b) => {
        const av = a.appliedAt ? a.appliedAt.getTime() : -Infinity;
        const bv = b.appliedAt ? b.appliedAt.getTime() : -Infinity;
        return bv - av; // desc, nulls (-Infinity) last
      });
    case "lastActivity":
    default:
      return copy.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
}

export interface ApplicationSummary {
  total: number;
  applied: number;
  interviewing: number;
  offers: number;
}

/** Plain factual counts only — deliberately no predicted "response rate". */
export function summarize(apps: AppWithJob[]): ApplicationSummary {
  let applied = 0;
  let interviewing = 0;
  let offers = 0;
  for (const app of apps) {
    if (app.status === "applied") applied++;
    else if (app.status === "interviewing") interviewing++;
    else if (app.status === "offer") offers++;
  }
  return { total: apps.length, applied, interviewing, offers };
}
