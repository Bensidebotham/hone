import { schedules } from "@trigger.dev/sdk";
import { prisma } from "@/lib/db";
import { BOARDS } from "@/lib/jobs/boards.config";
import { fetchBoard } from "@/lib/jobs/fetchers";
import { enrichJob } from "@/lib/jobs/enrich";
import { AGGREGATOR_SOURCES, fetchAggregator, resolveAggregatorClassification } from "@/lib/jobs/aggregator";
import { normalizeUrl } from "@/lib/jobs/url";

export const pollJobs = schedules.task({
  id: "poll-jobs",
  cron: "0 * * * *", // hourly
  run: async () => {
    let upserts = 0;

    // ── ATS boards ──────────────────────────────────────────────────────────
    for (const cfg of BOARDS) {
      const jobs = await fetchBoard(cfg).catch((err) => {
        console.warn(`[poll-jobs] ATS fetch threw for ${cfg.provider}:${cfg.slug}`, err);
        return [];
      });
      if (jobs.length === 0) {
        console.warn(`[poll-jobs] 0 jobs from ${cfg.provider}:${cfg.slug} (${cfg.company}) — check slug`);
      } else {
        console.log(`[poll-jobs] ${cfg.provider}:${cfg.slug} → ${jobs.length} jobs`);
      }
      for (const j of jobs) {
        const e = enrichJob({ title: j.title, location: j.location, descriptionText: j.descriptionText, salary: j.salary });
        await prisma.job.upsert({
          where: { source_externalId: { source: "ats", externalId: j.externalId } },
          create: {
            source: "ats", externalId: j.externalId, company: j.company, title: j.title,
            location: j.location, url: j.url, descriptionText: j.descriptionText, descriptionHtml: j.descriptionHtml,
            postedAt: j.postedAt, salary: j.salary, country: e.country, isRemote: e.isRemote,
            roleCategory: e.roleCategory, level: e.level, techTags: e.techTags,
            salaryMin: e.salaryMin, salaryMax: e.salaryMax, employmentType: e.employmentType, active: true,
          },
          update: {
            title: j.title, location: j.location, url: j.url, descriptionText: j.descriptionText,
            descriptionHtml: j.descriptionHtml, postedAt: j.postedAt, salary: j.salary, country: e.country,
            isRemote: e.isRemote, roleCategory: e.roleCategory, level: e.level, techTags: e.techTags,
            salaryMin: e.salaryMin, salaryMax: e.salaryMax, employmentType: e.employmentType, active: true,
          },
        });
        upserts++;
      }
    }

    // ── Aggregator lists ────────────────────────────────────────────────────
    // Prefer direct ATS records: skip an aggregator job whose URL matches an ATS job.
    const atsRows = await prisma.job.findMany({ where: { source: "ats" }, select: { url: true } });
    const atsUrls = new Set(atsRows.map((r) => normalizeUrl(r.url)).filter((u): u is string => u !== null));

    for (const src of AGGREGATOR_SOURCES) {
      const jobs = await fetchAggregator(src).catch((err) => {
        console.warn(`[poll-jobs] aggregator fetch threw for ${src.name}`, err);
        return [];
      });
      if (jobs.length === 0) {
        console.warn(`[poll-jobs] 0 jobs from aggregator ${src.name} — source may be down or not yet created`);
      } else {
        console.log(`[poll-jobs] aggregator ${src.name} → ${jobs.length} jobs`);
      }
      for (const j of jobs) {
        const norm = normalizeUrl(j.url);
        if (norm && atsUrls.has(norm)) continue; // dedup: ATS record wins
        const e = enrichJob({ title: j.title, location: j.location, descriptionText: "", salary: null });
        // Trust the title's level/type when it has a signal; fall back to the list's intent.
        // Prevents "Senior"/"Staff" listings in the new-grad list from leaking into the feed.
        const { level, employmentType } = resolveAggregatorClassification(e, j);
        await prisma.job.upsert({
          where: { source_externalId: { source: "aggregator", externalId: j.externalId } },
          create: {
            source: "aggregator", externalId: j.externalId, company: j.company, title: j.title,
            location: j.location, url: j.url, descriptionText: "", descriptionHtml: "",
            postedAt: j.postedAt, salary: null, country: e.country, isRemote: e.isRemote,
            roleCategory: e.roleCategory, level, techTags: e.techTags,
            salaryMin: null, salaryMax: null, employmentType, active: j.active,
          },
          update: {
            title: j.title, location: j.location, url: j.url, postedAt: j.postedAt,
            country: e.country, isRemote: e.isRemote, roleCategory: e.roleCategory, level,
            techTags: e.techTags, employmentType, active: j.active,
          },
        });
        upserts++;
      }
    }

    return { upserts };
  },
});
