import type { Prisma } from "@prisma/client";
import { z } from "zod";

const postedWithinPattern = /^\d+d$/;

const FilterParams = z.object({
  location: z.string().optional(),
  company: z.string().optional(),
  remote: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (typeof v === "boolean") return v;
      return v === "true";
    }),
  postedWithin: z
    .string()
    .optional()
    .transform((v) => {
      if (!v || !postedWithinPattern.test(v)) return undefined;
      return v;
    }),
});

export function buildJobWhere(
  rawParams: Record<string, string | string[] | undefined>,
  userId: string
): Prisma.JobWhereInput {
  // Flatten array values to first element so Zod sees strings
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(rawParams)) {
    flat[k] = Array.isArray(v) ? v[0] : v;
  }

  const parsed = FilterParams.safeParse(flat);
  type Params = Partial<z.infer<typeof FilterParams>>;
  const params: Params = parsed.success ? parsed.data : {};

  const base: Prisma.JobWhereInput = {
    OR: [{ source: "ats" }, { userId }],
  };

  const conditions: Prisma.JobWhereInput[] = [];

  const location = params.location?.trim();
  if (location) {
    conditions.push({ location: { contains: location, mode: "insensitive" } });
  }

  const company = params.company?.trim();
  if (company) {
    conditions.push({ company: { contains: company, mode: "insensitive" } });
  }

  if (params.remote === true) {
    conditions.push({
      location: { contains: "remote", mode: "insensitive" },
    });
  }

  if (params.postedWithin) {
    const days = parseInt(params.postedWithin, 10);
    const gte = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    conditions.push({ postedAt: { gte } });
  }

  if (conditions.length === 0) {
    return base;
  }

  return { ...base, AND: conditions };
}
