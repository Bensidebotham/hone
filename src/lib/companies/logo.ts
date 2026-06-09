// src/lib/companies/logo.ts

const SUFFIXES = /\b(inc|llc|ltd|corp|co|gmbh|plc)\b/gi;

/** Best-effort domain guess for a company name; null when not derivable. */
export function companyDomain(company: string): string | null {
  const cleaned = company
    .replace(SUFFIXES, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  return cleaned ? `${cleaned}.com` : null;
}

/** Logo service URL for a domain (Google's favicon service — no key required). */
export function logoUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;
}

/** Single-character monogram fallback. */
export function monogram(company: string): string {
  const ch = company.trim().match(/[a-z0-9]/i);
  return ch ? ch[0].toUpperCase() : "?";
}

/** Deterministic background color for a monogram, from the company name. */
export function monogramColor(company: string): string {
  let hash = 0;
  for (let i = 0; i < company.length; i++) {
    hash = (hash * 31 + company.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 55% 45%)`;
}
