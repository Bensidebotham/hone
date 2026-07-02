import type { ApplicationRow } from "@/app/(app)/applications/page";
import { parseSalaryRange } from "@/lib/applications/salary";

export type TableFilter = "all" | "active" | "saved";
export type TableSort = "company" | "status" | "applied" | "salary" | "lastActivity";
export type SortDir = "asc" | "desc";

export const DEFAULT_DIR: Record<TableSort, SortDir> = {
  company: "asc",
  status: "asc",
  applied: "desc",
  salary: "desc",
  lastActivity: "desc",
};

const STATUS_RANK: Record<string, number> = {
  saved: 0,
  applied: 1,
  interviewing: 2,
  offer: 3,
  rejected: 4,
};

/** Decide the next {key, dir} when a column/control is chosen. */
export function nextSort(
  currentKey: TableSort,
  currentDir: SortDir,
  clickedKey: TableSort
): { key: TableSort; dir: SortDir } {
  if (clickedKey === currentKey) {
    return { key: clickedKey, dir: currentDir === "asc" ? "desc" : "asc" };
  }
  return { key: clickedKey, dir: DEFAULT_DIR[clickedKey] };
}

/** Comparator that keeps nulls at the end in both directions. */
function nullsLast(a: number | null, b: number | null, flip: number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // a after b
  if (b === null) return -1; // a before b
  return flip * (a - b);
}

const ACTIVE_STATUSES = new Set(["applied", "interviewing", "offer"]);

/** Filter by status chip + free-text search over company and role title. */
export function filterApplications(
  apps: ApplicationRow[],
  { search, filter }: { search: string; filter: TableFilter }
): ApplicationRow[] {
  const q = search.trim().toLowerCase();
  return apps.filter((app) => {
    if (filter === "active" && !ACTIVE_STATUSES.has(app.status)) return false;
    if (filter === "saved" && app.status !== "saved") return false;
    if (q) {
      const hay = `${app.company} ${app.title}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Return a new, sorted array. Never mutates the input.
 * For `applied`/`salary`, rows with a null value always sort to the end,
 * regardless of direction — direction orders only the rows that have a value.
 */
export function sortApplications(
  apps: ApplicationRow[],
  key: TableSort,
  dir: SortDir
): ApplicationRow[] {
  const flip = dir === "asc" ? 1 : -1;
  const copy = [...apps];

  switch (key) {
    case "company":
      return copy.sort((a, b) => {
        const primary = a.company.toLowerCase().localeCompare(b.company.toLowerCase());
        if (primary !== 0) return flip * primary;
        return flip * a.title.toLowerCase().localeCompare(b.title.toLowerCase());
      });
    case "status":
      return copy.sort((a, b) => {
        const primary = (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99);
        if (primary !== 0) return flip * primary;
        return flip * a.company.toLowerCase().localeCompare(b.company.toLowerCase());
      });
    case "applied":
      return copy.sort((a, b) =>
        nullsLast(a.appliedAt?.getTime() ?? null, b.appliedAt?.getTime() ?? null, flip)
      );
    case "salary":
      return copy.sort((a, b) =>
        nullsLast(
          parseSalaryRange(a.salary).salaryMin,
          parseSalaryRange(b.salary).salaryMin,
          flip
        )
      );
    case "lastActivity":
    default:
      return copy.sort((a, b) => flip * (a.updatedAt.getTime() - b.updatedAt.getTime()));
  }
}

export interface ApplicationSummary {
  total: number;
  applied: number;
  interviewing: number;
  offers: number;
}

/** Plain factual counts only — deliberately no predicted "response rate". */
export function summarize(apps: ApplicationRow[]): ApplicationSummary {
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
