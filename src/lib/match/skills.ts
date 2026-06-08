// A pragmatic, extendable skill list. Lowercased, matched as word boundaries.
export const SKILLS = [
  "javascript", "typescript", "react", "next.js", "node", "python", "go", "rust",
  "java", "graphql", "rest", "postgres", "mysql", "redis", "aws", "gcp", "azure",
  "docker", "kubernetes", "terraform", "ci/cd", "tailwind", "prisma", "sql",
  "machine learning", "tensorflow", "pytorch", "pandas", "kafka", "spark",
] as const;

export function extractSkills(text: string): Set<string> {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const skill of SKILLS) {
    const esc = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(lower)) found.add(skill);
  }
  return found;
}
