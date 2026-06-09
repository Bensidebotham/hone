"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function JobSearchBar() {
  const sp = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [location, setLocation] = useState(sp.get("location") ?? "");

  useEffect(() => {
    setQ(sp.get("q") ?? "");
    setLocation(sp.get("location") ?? "");
  }, [sp]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams(sp.toString());
    q.trim() ? params.set("q", q.trim()) : params.delete("q");
    location.trim() ? params.set("location", location.trim()) : params.delete("location");
    params.delete("selected"); // reset selection on a new search
    const qs = params.toString();
    router.push(qs ? `/jobs?${qs}` : "/jobs");
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        type="text"
        placeholder="Search title or company"
        aria-label="Search title or company"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="flex-1"
      />
      <Input
        type="text"
        placeholder="Location (US)"
        aria-label="Location"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        className="flex-1"
      />
      <Button type="submit">Search</Button>
    </form>
  );
}
