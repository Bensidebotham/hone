"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function JobFilterBar() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [location, setLocation] = useState(searchParams.get("location") ?? "");
  const [company, setCompany] = useState(searchParams.get("company") ?? "");
  const [remote, setRemote] = useState(searchParams.get("remote") === "true");
  const [postedWithin, setPostedWithin] = useState(searchParams.get("postedWithin") ?? "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (location.trim()) params.set("location", location.trim());
    if (company.trim()) params.set("company", company.trim());
    if (remote) params.set("remote", "true");
    if (postedWithin) params.set("postedWithin", postedWithin);
    const qs = params.toString();
    router.push(qs ? `/jobs?${qs}` : "/jobs");
  }

  function handleClear() {
    setLocation("");
    setCompany("");
    setRemote(false);
    setPostedWithin("");
    router.push("/jobs");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      {/* Location */}
      <div className="flex flex-col gap-1 min-w-36">
        <label htmlFor="filter-location" className="text-xs font-medium text-muted-foreground">
          Location
        </label>
        <Input
          id="filter-location"
          type="text"
          placeholder="e.g. New York"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>

      {/* Company */}
      <div className="flex flex-col gap-1 min-w-36">
        <label htmlFor="filter-company" className="text-xs font-medium text-muted-foreground">
          Company
        </label>
        <Input
          id="filter-company"
          type="text"
          placeholder="e.g. Acme Corp"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>

      {/* Posted within */}
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-posted-within" className="text-xs font-medium text-muted-foreground">
          Posted within
        </label>
        <select
          id="filter-posted-within"
          value={postedWithin}
          onChange={(e) => setPostedWithin(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 transition-colors"
        >
          <option value="">Any time</option>
          <option value="1d">Past day</option>
          <option value="7d">Past week</option>
          <option value="30d">Past month</option>
        </select>
      </div>

      {/* Remote only */}
      <div className="flex flex-col gap-1">
        {/* Spacer to align with other labelled fields */}
        <span className="text-xs font-medium text-transparent select-none" aria-hidden="true">
          &nbsp;
        </span>
        <label className="flex h-8 items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={remote}
            onChange={(e) => setRemote(e.target.checked)}
            className="h-4 w-4 rounded border border-input accent-primary"
          />
          Remote only
        </label>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-transparent select-none" aria-hidden="true">
          &nbsp;
        </span>
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm">
            Apply filters
          </Button>
          <button
            type="button"
            onClick={handleClear}
            className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
    </form>
  );
}
