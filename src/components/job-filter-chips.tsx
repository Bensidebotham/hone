"use client";

import { useRouter, useSearchParams } from "next/navigation";

const PILL_BASE =
  "h-9 appearance-none rounded-full border bg-card pl-4 pr-9 text-sm font-semibold " +
  "outline-none transition-colors cursor-pointer focus-visible:ring-3 focus-visible:ring-ring/50";
const PILL_IDLE = "border-border text-foreground hover:border-primary";
const PILL_ACTIVE = "border-transparent bg-secondary text-secondary-foreground";

const SORT_OPTIONS = [["", "Sort: Newest"], ["salary", "Sort: Highest salary"]] as const;

const ROLE_OPTIONS = [
  ["", "Role: Any"], ["frontend", "Frontend"], ["backend", "Backend"],
  ["fullstack", "Full-stack"], ["mobile", "Mobile"], ["ml-ai", "ML / AI"],
  ["data", "Data"], ["devops", "DevOps"], ["security", "Security"], ["qa", "QA"],
] as const;

const LEVEL_OPTIONS = [
  ["", "New grad"], ["intern", "Internships"], ["all", "All roles"],
] as const;

const DATE_OPTIONS = [
  ["", "Date: Any"], ["1d", "Past day"], ["7d", "Past week"], ["30d", "Past month"],
] as const;

const SALARY_OPTIONS = [
  ["", "Salary: Any"], ["100000", "$100k+"], ["150000", "$150k+"], ["200000", "$200k+"],
] as const;

const TECH_OPTIONS = [
  ["", "Tech: Any"], ["React", "React"], ["TypeScript", "TypeScript"],
  ["Python", "Python"], ["Go", "Go"], ["Java", "Java"], ["AWS", "AWS"],
] as const;

export function JobFilterChips() {
  const sp = useSearchParams();
  const router = useRouter();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    value ? params.set(key, value) : params.delete(key);
    params.delete("selected");
    const qs = params.toString();
    router.push(qs ? `/jobs?${qs}` : "/jobs");
  }

  function Chip({
    name, options, current,
  }: {
    name: string;
    options: ReadonlyArray<readonly [string, string]>;
    current: string;
  }) {
    const active = current !== "";
    return (
      <div className="relative inline-flex">
        <select
          aria-label={name}
          value={current}
          onChange={(e) => setParam(name, e.target.value)}
          className={`${PILL_BASE} ${active ? PILL_ACTIVE : PILL_IDLE}`}
        >
          {options.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-60"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    );
  }

  const remote = sp.get("remote") === "true";

  const FILTER_KEYS = ["q", "location", "roleCategory", "level", "techTags", "salaryMin", "postedWithin", "remote"];
  const hasActiveFilters = FILTER_KEYS.some((k) => sp.get(k));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip name="sort" options={SORT_OPTIONS} current={sp.get("sort") ?? ""} />
      <Chip name="postedWithin" options={DATE_OPTIONS} current={sp.get("postedWithin") ?? ""} />
      <Chip name="roleCategory" options={ROLE_OPTIONS} current={sp.get("roleCategory") ?? ""} />
      <Chip name="level" options={LEVEL_OPTIONS} current={sp.get("level") ?? ""} />
      <Chip name="techTags" options={TECH_OPTIONS} current={sp.get("techTags") ?? ""} />
      <Chip name="salaryMin" options={SALARY_OPTIONS} current={sp.get("salaryMin") ?? ""} />
      <label
        className={`flex h-9 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${
          remote ? "border-transparent bg-secondary text-secondary-foreground" : "border-border hover:border-primary"
        }`}
      >
        <input
          type="checkbox"
          checked={remote}
          onChange={(e) => setParam("remote", e.target.checked ? "true" : "")}
          className="h-4 w-4 rounded border border-input accent-primary"
        />
        Remote
      </label>
      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => router.push("/jobs")}
          className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
