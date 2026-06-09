export const JOBS_PAGE_SIZE = 25;

export interface JobListRow {
  id: string;
  title: string;
  company: string;
  location: string | null;
  url: string | null;
  salary: string | null;
  postedAt: Date | null;
  roleCategory: string | null;
  level: string | null;
  techTags: string[];
  descriptionText: string;
}
