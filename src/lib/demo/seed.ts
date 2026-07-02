import { prisma } from "@/lib/db";
import { DEMO_EMAIL, DEMO_NAME } from "@/lib/demo/config";
import type { AppStatus, AppEventType } from "@prisma/client";

// Fabricated data for the public demo. Deliberately fictional companies so it's
// obviously a showcase and never resembles a real person's job search.

interface DemoApp {
  company: string;
  title: string;
  location: string;
  status: AppStatus;
  daysAgo: number; // when it entered the tracker
  events: { type: AppEventType; toStatus: AppStatus; summary: string; daysAgo: number }[];
}

const DEMO_APPS: DemoApp[] = [
  { company: "Globex", title: "Senior Frontend Engineer", location: "Remote", status: "offer", daysAgo: 24,
    events: [
      { type: "created", toStatus: "saved", summary: "Added to tracker", daysAgo: 24 },
      { type: "status_change", toStatus: "applied", summary: "Moved to Applied", daysAgo: 22 },
      { type: "email_detected", toStatus: "interviewing", summary: "Interviewing (detected from email)", daysAgo: 15 },
      { type: "email_detected", toStatus: "offer", summary: "Offer (detected from email)", daysAgo: 0.15 },
    ] },
  { company: "Stark Industries", title: "Full-Stack Engineer", location: "New York, NY", status: "interviewing", daysAgo: 18,
    events: [
      { type: "created", toStatus: "saved", summary: "Added to tracker", daysAgo: 18 },
      { type: "status_change", toStatus: "applied", summary: "Moved to Applied", daysAgo: 17 },
      { type: "email_detected", toStatus: "interviewing", summary: "Interviewing (detected from email)", daysAgo: 0.5 },
    ] },
  { company: "Hooli", title: "Software Engineer, Platform", location: "Mountain View, CA", status: "rejected", daysAgo: 20,
    events: [
      { type: "created", toStatus: "saved", summary: "Added to tracker", daysAgo: 20 },
      { type: "status_change", toStatus: "applied", summary: "Moved to Applied", daysAgo: 19 },
      { type: "email_detected", toStatus: "rejected", summary: "Rejected (detected from email)", daysAgo: 0.9 },
    ] },
  { company: "Wayne Enterprises", title: "Backend Engineer", location: "Remote", status: "interviewing", daysAgo: 12,
    events: [
      { type: "created", toStatus: "saved", summary: "Added to tracker", daysAgo: 12 },
      { type: "status_change", toStatus: "applied", summary: "Moved to Applied", daysAgo: 11 },
      { type: "status_change", toStatus: "interviewing", summary: "Moved to Interviewing", daysAgo: 0.7 },
    ] },
  { company: "Initech", title: "Frontend Engineer", location: "Austin, TX", status: "applied", daysAgo: 8,
    events: [
      { type: "created", toStatus: "saved", summary: "Added to tracker", daysAgo: 8 },
      { type: "status_change", toStatus: "applied", summary: "Moved to Applied", daysAgo: 7 },
    ] },
  { company: "Pied Piper", title: "Software Engineer", location: "Remote", status: "applied", daysAgo: 6,
    events: [
      { type: "created", toStatus: "saved", summary: "Added to tracker", daysAgo: 6 },
      { type: "status_change", toStatus: "applied", summary: "Moved to Applied", daysAgo: 5 },
    ] },
  { company: "Soylent", title: "Product Engineer", location: "San Francisco, CA", status: "rejected", daysAgo: 16,
    events: [
      { type: "created", toStatus: "saved", summary: "Added to tracker", daysAgo: 16 },
      { type: "status_change", toStatus: "applied", summary: "Moved to Applied", daysAgo: 15 },
      { type: "status_change", toStatus: "rejected", summary: "Moved to Rejected", daysAgo: 6 },
    ] },
  { company: "Vandelay Industries", title: "Senior Software Engineer", location: "Remote", status: "saved", daysAgo: 2,
    events: [{ type: "created", toStatus: "saved", summary: "Added to tracker", daysAgo: 2 }] },
  { company: "Umbrella Corp", title: "Platform Engineer", location: "Boston, MA", status: "saved", daysAgo: 1,
    events: [{ type: "created", toStatus: "saved", summary: "Added to tracker", daysAgo: 1 }] },
];

// Pending email-detected suggestions, to showcase the "Suggested updates" card.
const DEMO_SUGGESTIONS = [
  { company: "Initech", title: "Frontend Engineer", kind: "status_change", suggestedStatus: "interviewing" as AppStatus, fromEmail: "recruiting@initech.com", subject: "Next steps — let's schedule a call", confidence: 0.66 },
  { company: "Cyberdyne Systems", title: "Software Engineer", kind: "new_application", suggestedStatus: "applied" as AppStatus, fromEmail: "no-reply@greenhouse.io", subject: "We received your application to Cyberdyne", confidence: 0.74 },
];

function daysAgoDate(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function ensureDemoUser(): Promise<{ id: string; email: string }> {
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: { email: DEMO_EMAIL, name: DEMO_NAME },
    update: {},
    select: { id: true, email: true },
  });
  return { id: user.id, email: user.email! };
}

/** Wipe and rebuild the demo account's data. Scoped to the demo user only. */
export async function reseedDemoData(userId: string): Promise<void> {
  // Remove prior demo content (cascades clear events/insights via FK rules,
  // but delete explicitly to be safe and order-independent).
  await prisma.emailInsight.deleteMany({ where: { userId } });
  await prisma.applicationEvent.deleteMany({ where: { userId } });
  await prisma.application.deleteMany({ where: { userId } });

  const appByCompany = new Map<string, string>();

  for (const a of DEMO_APPS) {
    const application = await prisma.application.create({
      data: {
        userId,
        company: a.company,
        title: a.title,
        location: a.location,
        status: a.status,
        appliedAt: a.status === "saved" ? null : daysAgoDate(a.daysAgo - 1),
        createdAt: daysAgoDate(a.daysAgo),
      },
    });
    appByCompany.set(a.company, application.id);

    for (const e of a.events) {
      await prisma.applicationEvent.create({
        data: {
          applicationId: application.id,
          userId,
          type: e.type,
          toStatus: e.toStatus,
          summary: e.summary,
          createdAt: daysAgoDate(e.daysAgo),
        },
      });
    }
  }

  for (const s of DEMO_SUGGESTIONS) {
    await prisma.emailInsight.create({
      data: {
        userId,
        messageId: `demo:${s.company}:${s.kind}`,
        fromEmail: s.fromEmail,
        subject: s.subject,
        kind: s.kind,
        suggestedStatus: s.suggestedStatus,
        applicationId: s.kind === "status_change" ? appByCompany.get(s.company) ?? null : null,
        company: s.kind === "new_application" ? s.company : null,
        title: s.kind === "new_application" ? s.title : null,
        confidence: s.confidence,
        outcome: "suggested",
      },
    });
  }
}

// In-instance debounce: avoid reseeding on every click. A cold start resets
// this (and reseeds once), which is exactly the "freshen when stale" behavior.
let lastReseedAt = 0;
const RESEED_INTERVAL_MS = 30 * 60 * 1000;

/** Ensure the demo account exists and is populated; refresh it when stale or empty. */
export async function ensureFreshDemo(): Promise<{ id: string; email: string }> {
  const user = await ensureDemoUser();
  const now = Date.now();
  const appCount = await prisma.application.count({ where: { userId: user.id } });

  if (appCount === 0 || now - lastReseedAt > RESEED_INTERVAL_MS) {
    await reseedDemoData(user.id);
    lastReseedAt = now;
  }
  return user;
}
