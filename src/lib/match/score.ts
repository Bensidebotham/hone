import { extractSkills } from "./skills";

export interface MatchResult { score: number; matched: string[]; missing: string[]; }

export function scoreMatch(resumeText: string, jdText: string): MatchResult {
  const resumeSkills = extractSkills(resumeText);
  const jdSkills = [...extractSkills(jdText)];
  if (jdSkills.length === 0) return { score: 0, matched: [], missing: [] };
  const matched = jdSkills.filter((s) => resumeSkills.has(s));
  const missing = jdSkills.filter((s) => !resumeSkills.has(s));
  const score = Math.round((matched.length / jdSkills.length) * 100);
  return { score, matched, missing };
}
