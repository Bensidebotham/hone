// src/lib/jobs/enrich.ts
import {
  US_STATE_CODES,
  US_STATE_NAMES,
  US_CITIES,
  US_MARKERS,
  ROLE_RULES,
  LEVEL_RULES,
} from "./enrich.data";

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
