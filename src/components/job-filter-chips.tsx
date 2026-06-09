"use client";

import { useRouter, useSearchParams } from "next/navigation";

const SELECT_CLASS =
  "h-8 rounded-full border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 transition-colors dark:bg-input/30";

const ROLE_OPTIONS = [
  ["", "Role: Any"], ["frontend", "Frontend"], ["backend", "Backend"],
  ["fullstack", "Full-stack"], ["mobile", "Mobile"], ["ml-ai", "ML / AI"],
  ["data", "Data"], ["devops", "DevOps"], ["security", "Security"], ["qa", "QA"],
] as const;

const LEVEL_OPTIONS = [
  ["", "Level: Any"], ["intern", "Intern"], ["junior", "Junior"], ["mid", "Mid"],
  ["senior", "Senior"], ["staff", "Staff"], ["lead", "Lead"], ["manager", "Manager"],
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
    return (
      <select
        aria-label={name}
        className={SELECT_CLASS}
        value={current}
        onChange={(e) => setParam(name, e.target.value)}
      >
        {options.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    );
  }

  const remote = sp.get("remote") === "true";

  const FILTER_KEYS = ["q", "location", "roleCategory", "level", "techTags", "salaryMin", "postedWithin", "remote"];
  const hasActiveFilters = FILTER_KEYS.some((k) => sp.get(k));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip name="postedWithin" options={DATE_OPTIONS} current={sp.get("postedWithin") ?? ""} />
      <Chip name="roleCategory" options={ROLE_OPTIONS} current={sp.get("roleCategory") ?? ""} />
      <Chip name="level" options={LEVEL_OPTIONS} current={sp.get("level") ?? ""} />
      <Chip name="techTags" options={TECH_OPTIONS} current={sp.get("techTags") ?? ""} />
      <Chip name="salaryMin" options={SALARY_OPTIONS} current={sp.get("salaryMin") ?? ""} />
      <label className="flex h-8 items-center gap-2 cursor-pointer text-sm rounded-full border border-input px-3">
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
