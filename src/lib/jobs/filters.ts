import type { Prisma } from "@prisma/client";
import { z } from "zod";

const postedWithinPattern = /^[1-9]\d*d$/;

const FilterParams = z.object({
  q: z.string().optional(),
  location: z.string().optional(),
  company: z.string().optional(),
  roleCategory: z.string().optional(),
  level: z.string().optional(),
  techTags: z.string().optional(),
  remote: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  salaryMin: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    }),
  postedWithin: z
    .string()
    .optional()
    .transform((v) => (!v || !postedWithinPattern.test(v) ? undefined : v)),
});

// Software / CS role categories shown in the feed. Excludes "other" (non-technical) and unclassified.
export const CS_ROLE_CATEGORIES = [
  "frontend", "backend", "fullstack", "mobile",
  "ml-ai", "data", "devops", "security", "qa",
] as const;

export function buildJobWhere(
  rawParams: Record<string, string | string[] | undefined>,
  _userId: string
): Prisma.JobWhereInput {
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(rawParams)) {
    flat[k] = Array.isArray(v) ? v[0] : v;
  }

  const parsed = FilterParams.safeParse(flat);
  const params = parsed.success ? parsed.data : ({} as z.infer<typeof FilterParams>);

  // Base: ATS-sourced, CS/software roles only, US or remote only.
  const base: Prisma.JobWhereInput = {
    source: "ats",
    roleCategory: { in: [...CS_ROLE_CATEGORIES] },
    OR: [{ country: "US" }, { isRemote: true }],
  };

  const conditions: Prisma.JobWhereInput[] = [];

  const q = params.q?.trim();
  if (q) {
    conditions.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  const location = params.location?.trim();
  if (location) {
    conditions.push({ location: { contains: location, mode: "insensitive" } });
  }

  const company = params.company?.trim();
  if (company) {
    conditions.push({ company: { contains: company, mode: "insensitive" } });
  }

  if (params.roleCategory) {
    conditions.push({ roleCategory: params.roleCategory });
  }

  if (params.level) {
    conditions.push({ level: params.level });
  }

  const techTags = params.techTags
    ?.split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (techTags && techTags.length > 0) {
    conditions.push({ techTags: { hasSome: techTags } });
  }

  if (params.remote === true) {
    conditions.push({ isRemote: true });
  }

  if (params.salaryMin !== undefined) {
    conditions.push({
      OR: [
        { salaryMax: { gte: params.salaryMin } },
        { AND: [{ salaryMax: null }, { salaryMin: { gte: params.salaryMin } }] },
      ],
    });
  }

  if (params.postedWithin) {
    const days = parseInt(params.postedWithin, 10);
    const gte = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    conditions.push({ postedAt: { gte } });
  }

  if (conditions.length === 0) return base;
  return { ...base, AND: conditions };
}
