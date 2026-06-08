export interface ComponentScores {
  resume: number | null;
  linkedin: number | null;
  site: number | null;
}

export function computeComposite(s: ComponentScores): number {
  const vals = [s.resume, s.linkedin, s.site].filter((v): v is number => v != null);
  if (vals.length === 0) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}
