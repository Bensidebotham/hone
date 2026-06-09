// src/lib/jobs/enrich.ts
import { parseSalaryRange } from "./salary";
import {
  US_STATE_CODES,
  US_STATE_NAMES,
  US_CITIES,
  US_MARKERS,
  ROLE_RULES,
  LEVEL_RULES,
  TECH_TERMS,
} from "./enrich.data";

// Precompile tech term regexes once at module load.
const TECH_REGEXES = TECH_TERMS.map(
  ([name, src]) => [name, new RegExp(src, "i")] as const
);

export interface LocationInfo {
  country: string | null;
  isRemote: boolean;
}

export function parseLocation(location: string | null | undefined): LocationInfo {
  if (!location) return { country: null, isRemote: false };
  const raw = location.toLowerCase();
  const isRemote = /\bremote\b/.test(raw);

  // Explicit US markers anywhere in the string.
  if (US_MARKERS.some((m) => raw.includes(m))) {
    return { country: "US", isRemote };
  }

  // Token-based checks: split on commas / parens / slashes.
  const tokens = raw.split(/[,/()]/).map((t) => t.trim()).filter(Boolean);
  for (const tok of tokens) {
    const upper = tok.toUpperCase();
    if (upper === "US" || upper === "USA") return { country: "US", isRemote };
    if (US_STATE_CODES.has(upper)) return { country: "US", isRemote };
    if (US_STATE_NAMES.has(tok)) return { country: "US", isRemote };
    if (US_CITIES.has(tok)) return { country: "US", isRemote };
  }

  return { country: null, isRemote };
}

export interface RoleInfo {
  roleCategory: string;
  level: string | null;
}

export function classifyRole(title: string | null | undefined): RoleInfo {
  const t = (title ?? "").toLowerCase();

  let roleCategory = "other";
  for (const [category, keywords] of ROLE_RULES) {
    if (keywords.some((k) => t.includes(k))) {
      roleCategory = category;
      break;
    }
  }

  let level: string | null = null;
  for (const [lvl, keywords] of LEVEL_RULES) {
    if (keywords.some((k) => t.includes(k))) {
      level = lvl;
      break;
    }
  }

  return { roleCategory, level };
}

export function extractTechTags(title: string, description: string): string[] {
  const haystack = `${title} ${description}`;
  const found: string[] = [];
  for (const [name, re] of TECH_REGEXES) {
    if (re.test(haystack)) found.push(name);
  }
  return found;
}

export interface EnrichInput {
  title: string;
  location: string | null;
  descriptionText: string;
  salary: string | null;
}

export interface JobEnrichment {
  country: string | null;
  isRemote: boolean;
  roleCategory: string;
  level: string | null;
  techTags: string[];
  salaryMin: number | null;
  salaryMax: number | null;
}

export function enrichJob(input: EnrichInput): JobEnrichment {
  const { country, isRemote } = parseLocation(input.location);
  const { roleCategory, level } = classifyRole(input.title);
  const techTags = extractTechTags(input.title, input.descriptionText);
  // Prefer the salary field; fall back to scanning the description.
  const { salaryMin, salaryMax } = parseSalaryRange(
    input.salary ?? input.descriptionText
  );
  return { country, isRemote, roleCategory, level, techTags, salaryMin, salaryMax };
}
