import { type JobListItemData } from "@/components/job-list-item";
import { type JobListRow } from "@/lib/jobs/constants";

export interface BrowserJob extends JobListItemData {
  url: string | null;
}

export function toBrowserJob(row: JobListRow): BrowserJob {
  return {
    id: row.id, title: row.title, company: row.company, location: row.location,
    salary: row.salary, url: row.url,
    postedAt: row.postedAt ? new Date(row.postedAt).toISOString() : null,
    techTags: row.techTags,
    // Aggregator listings have no on-site apply flow — they link out to the original posting.
    external: row.source === "aggregator",
  };
}
