import { type JobListItemData } from "@/components/job-list-item";
import { type JobListRow } from "@/lib/jobs/constants";

export interface BrowserJob extends JobListItemData {
  url: string | null;
  descriptionText: string;
  descriptionHtml: string | null;
}

export function toBrowserJob(row: JobListRow): BrowserJob {
  return {
    id: row.id, title: row.title, company: row.company, location: row.location,
    salary: row.salary, url: row.url,
    postedAt: row.postedAt ? new Date(row.postedAt).toISOString() : null,
    techTags: row.techTags, descriptionText: row.descriptionText,
    descriptionHtml: row.descriptionHtml,
  };
}
