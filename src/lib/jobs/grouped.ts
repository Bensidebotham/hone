import { prisma } from "@/lib/db";
import { buildJobWhere } from "@/lib/jobs/filters";
import { jobOrderBy, JOB_LIST_SELECT, type JobListRow } from "@/lib/jobs/constants";

export const COMPANIES_PER_PAGE = 12;

export interface CompanyGroup {
  company: string;
  totalCount: number;
  topRoles: JobListRow[];
}

export async function getCompanyFeedPage(
  params: Record<string, string | undefined>,
  userId: string,
  page: number
): Promise<{ groups: CompanyGroup[]; hasMore: boolean }> {
  const where = buildJobWhere(params, userId);
  const companyOrder =
    params.sort === "salary"
      ? { _max: { salaryMax: "desc" as const } }
      : { _max: { postedAt: "desc" as const } };

  const grouped = await prisma.job.groupBy({
    by: ["company"],
    where,
    _count: { _all: true },
    _max: { postedAt: true, salaryMax: true },
    orderBy: companyOrder,
    take: COMPANIES_PER_PAGE + 1,
    skip: page * COMPANIES_PER_PAGE,
  });

  const hasMore = grouped.length > COMPANIES_PER_PAGE;
  const pageCompanies = grouped.slice(0, COMPANIES_PER_PAGE);

  const groups = await Promise.all(
    pageCompanies.map(async (g) => {
      const topRoles = await prisma.job.findMany({
        where: { AND: [where, { company: g.company }] },
        orderBy: jobOrderBy(params.sort),
        take: 2,
        select: JOB_LIST_SELECT,
      });
      return { company: g.company, totalCount: g._count._all, topRoles };
    })
  );

  return { groups, hasMore };
}
