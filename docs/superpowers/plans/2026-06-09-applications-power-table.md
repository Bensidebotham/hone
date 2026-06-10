# Applications Power Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Applications Kanban board with a modern, sortable/filterable "power table" that also lets users add jobs manually, and promote Applications to the 2nd sidebar slot.

**Architecture:** A server component fetches applications (with their job) and renders a client `ApplicationsTable` that owns search/filter/sort state. Pure, unit-tested helpers in `lib/applications/table.ts` derive the displayed rows and summary counts. Status is edited inline via a Base UI menu pill; all other fields are edited in a Base UI dialog. Manual adds create a `paste`-source `Job` + `Application` via a new server action. The Kanban code is left in the repo but no longer imported.

**Tech Stack:** Next.js (App Router, RSC), React 19, Prisma 7, Base UI (`@base-ui/react`), Tailwind v4, vitest + @testing-library/react (jsdom), Playwright.

---

## File Structure

**Create:**
- `src/lib/applications/table.ts` — pure filter/sort/summarize helpers
- `src/lib/applications/table.test.ts` — unit tests for the above
- `src/components/ui/dialog.tsx` — Base UI Dialog wrapper (shared)
- `src/components/ui/menu.tsx` — Base UI Menu wrapper (shared)
- `src/components/status-pill.tsx` — inline-editable status pill (menu)
- `src/components/application-stat-tiles.tsx` — summary count tiles
- `src/components/add-job-dialog.tsx` — manual add form (dialog)
- `src/components/application-detail-panel.tsx` — edit/delete one application (dialog)
- `src/components/applications-table.tsx` — owns view state; renders tiles + toolbar + table + rows
- `src/components/applications-table.test.tsx` — render/interaction smoke tests

**Modify:**
- `src/lib/applications/actions.ts` — add `createManualApplication`, `updateApplicationDetails`, `deleteApplication`
- `src/lib/applications/actions.test.ts` — tests for the new actions
- `src/app/(app)/applications/page.tsx` — hero header + render `ApplicationsTable`
- `src/components/app-nav.tsx` — reorder nav items
- `e2e/applications.spec.ts` — add manual-add / status / delete flow

**Leave dormant (do NOT delete, do NOT import after this change):**
- `src/components/application-kanban.tsx`, `src/components/application-card.tsx`, `src/lib/applications/kanban.ts` (+ its test stays green)

---

## Status color reference (use consistently everywhere)

| status | pill classes | dot color |
|---|---|---|
| saved | `bg-[#f0f1f5] text-[#5b6275]` | `#9aa0b0` |
| applied | `bg-accent text-accent-foreground` | `#7c63ec` |
| interviewing | `bg-[#fdf4d8] text-[#9a7212]` | `#e0a818` |
| offer | `bg-[#def6e0] text-[#268a3a]` | `#3bbf52` |
| rejected | `bg-[#f8e6e6] text-[#b14a4a]` | `#d57272` |

The 5 statuses and their labels already exist in `src/lib/applications/kanban.ts` as `KANBAN_STATUSES` / `KANBAN_COLUMNS`. **Reuse those exports** for the status list + labels — do not redefine the status union.

---

## Task 1: Pure table logic (`lib/applications/table.ts`)

**Files:**
- Create: `src/lib/applications/table.ts`
- Test: `src/lib/applications/table.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/applications/table.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { AppWithJob } from "@/app/(app)/applications/page";
import {
  filterApplications,
  sortApplications,
  summarize,
  type TableFilter,
  type TableSort,
} from "./table";

function makeApp(
  id: string,
  status: string,
  opts: {
    company?: string;
    title?: string;
    appliedAt?: Date | null;
    updatedAt?: Date;
  } = {}
): AppWithJob {
  const updatedAt = opts.updatedAt ?? new Date("2024-01-01");
  return {
    id,
    status,
    userId: "u1",
    jobId: `j-${id}`,
    notes: null,
    appliedAt: opts.appliedAt ?? null,
    createdAt: new Date("2024-01-01"),
    updatedAt,
    job: {
      id: `j-${id}`,
      title: opts.title ?? `Job ${id}`,
      company: opts.company ?? "Acme",
      location: null,
      url: null,
      salary: null,
      source: "paste",
    },
  } as unknown as AppWithJob;
}

describe("filterApplications", () => {
  const apps = [
    makeApp("a", "saved", { company: "Stripe" }),
    makeApp("b", "applied", { company: "Ramp" }),
    makeApp("c", "interviewing", { company: "Notion" }),
    makeApp("d", "offer", { company: "Vercel" }),
    makeApp("e", "rejected", { company: "Linear" }),
  ];

  it("All returns every application", () => {
    expect(filterApplications(apps, { search: "", filter: "all" })).toHaveLength(5);
  });

  it("Active returns applied/interviewing/offer only", () => {
    const ids = filterApplications(apps, { search: "", filter: "active" }).map((a) => a.id);
    expect(ids).toEqual(["b", "c", "d"]);
  });

  it("Saved returns only saved", () => {
    const ids = filterApplications(apps, { search: "", filter: "saved" }).map((a) => a.id);
    expect(ids).toEqual(["a"]);
  });

  it("search matches company case-insensitively", () => {
    const ids = filterApplications(apps, { search: "stri", filter: "all" }).map((a) => a.id);
    expect(ids).toEqual(["a"]);
  });

  it("search matches role title", () => {
    const list = [makeApp("x", "saved", { title: "Frontend Engineer" })];
    expect(filterApplications(list, { search: "frontend", filter: "all" })).toHaveLength(1);
  });
});

describe("sortApplications", () => {
  it("lastActivity sorts by updatedAt desc", () => {
    const apps = [
      makeApp("old", "saved", { updatedAt: new Date("2024-01-01") }),
      makeApp("new", "saved", { updatedAt: new Date("2024-03-01") }),
    ];
    expect(sortApplications(apps, "lastActivity").map((a) => a.id)).toEqual(["new", "old"]);
  });

  it("applied sorts by appliedAt desc with nulls last", () => {
    const apps = [
      makeApp("null", "saved", { appliedAt: null }),
      makeApp("jan", "applied", { appliedAt: new Date("2024-01-01") }),
      makeApp("mar", "applied", { appliedAt: new Date("2024-03-01") }),
    ];
    expect(sortApplications(apps, "applied").map((a) => a.id)).toEqual(["mar", "jan", "null"]);
  });

  it("company sorts A→Z case-insensitively", () => {
    const apps = [
      makeApp("1", "saved", { company: "zeta" }),
      makeApp("2", "saved", { company: "Alpha" }),
    ];
    expect(sortApplications(apps, "company").map((a) => a.id)).toEqual(["2", "1"]);
  });

  it("does not mutate the input array", () => {
    const apps = [makeApp("a", "saved"), makeApp("b", "saved")];
    const copy = [...apps];
    sortApplications(apps, "company");
    expect(apps).toEqual(copy);
  });
});

describe("summarize", () => {
  it("returns zero counts for an empty list", () => {
    expect(summarize([])).toEqual({ total: 0, applied: 0, interviewing: 0, offers: 0 });
  });

  it("counts each stage (counts only, no derived rate)", () => {
    const apps = [
      makeApp("a", "saved"),
      makeApp("b", "applied"),
      makeApp("c", "applied"),
      makeApp("d", "interviewing"),
      makeApp("e", "offer"),
      makeApp("f", "rejected"),
    ];
    expect(summarize(apps)).toEqual({ total: 6, applied: 2, interviewing: 1, offers: 1 });
  });
});

// Type guards so the test fails to compile if the public types drift
const _f: TableFilter = "active";
const _s: TableSort = "lastActivity";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/applications/table.test.ts`
Expected: FAIL — cannot resolve `./table`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/applications/table.ts`:

```typescript
import type { AppWithJob } from "@/app/(app)/applications/page";

export type TableFilter = "all" | "active" | "saved";
export type TableSort = "lastActivity" | "applied" | "company";

const ACTIVE_STATUSES = new Set(["applied", "interviewing", "offer"]);

/** Filter by status chip + free-text search over company and role title. */
export function filterApplications(
  apps: AppWithJob[],
  { search, filter }: { search: string; filter: TableFilter }
): AppWithJob[] {
  const q = search.trim().toLowerCase();
  return apps.filter((app) => {
    if (filter === "active" && !ACTIVE_STATUSES.has(app.status)) return false;
    if (filter === "saved" && app.status !== "saved") return false;
    if (q) {
      const hay = `${app.job.company} ${app.job.title}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Return a new, sorted array. Never mutates the input. */
export function sortApplications(apps: AppWithJob[], sort: TableSort): AppWithJob[] {
  const copy = [...apps];
  switch (sort) {
    case "company":
      return copy.sort((a, b) =>
        a.job.company.toLowerCase().localeCompare(b.job.company.toLowerCase())
      );
    case "applied":
      return copy.sort((a, b) => {
        const av = a.appliedAt ? a.appliedAt.getTime() : -Infinity;
        const bv = b.appliedAt ? b.appliedAt.getTime() : -Infinity;
        return bv - av; // desc, nulls (-Infinity) last
      });
    case "lastActivity":
    default:
      return copy.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
}

export interface ApplicationSummary {
  total: number;
  applied: number;
  interviewing: number;
  offers: number;
}

/** Plain factual counts only — deliberately no predicted "response rate". */
export function summarize(apps: AppWithJob[]): ApplicationSummary {
  let applied = 0;
  let interviewing = 0;
  let offers = 0;
  for (const app of apps) {
    if (app.status === "applied") applied++;
    else if (app.status === "interviewing") interviewing++;
    else if (app.status === "offer") offers++;
  }
  return { total: apps.length, applied, interviewing, offers };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/applications/table.test.ts`
Expected: PASS (all suites green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/applications/table.ts src/lib/applications/table.test.ts
git commit -m "feat(applications): pure filter/sort/summarize table helpers"
```

---

## Task 2: Server actions (manual add, detail edit, delete)

**Files:**
- Modify: `src/lib/applications/actions.ts`
- Test: `src/lib/applications/actions.test.ts`

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `src/lib/applications/actions.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "u1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const appCreate = vi.fn().mockResolvedValue({ id: "app1" });
const appUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
const appUpdate = vi.fn().mockResolvedValue({ id: "app1" });
const appFindFirst = vi.fn();
const appDelete = vi.fn().mockResolvedValue({ id: "app1" });
const appCount = vi.fn().mockResolvedValue(0);
const jobCreate = vi.fn().mockResolvedValue({ id: "job1" });
const jobUpdate = vi.fn().mockResolvedValue({ id: "job1" });
const jobDelete = vi.fn().mockResolvedValue({ id: "job1" });

vi.mock("@/lib/db", () => ({
  prisma: {
    application: {
      create: (...a: any) => appCreate(...a),
      updateMany: (...a: any) => appUpdateMany(...a),
      update: (...a: any) => appUpdate(...a),
      findFirst: (...a: any) => appFindFirst(...a),
      delete: (...a: any) => appDelete(...a),
      count: (...a: any) => appCount(...a),
    },
    job: {
      create: (...a: any) => jobCreate(...a),
      update: (...a: any) => jobUpdate(...a),
      delete: (...a: any) => jobDelete(...a),
    },
  },
}));

import {
  addApplication,
  updateStatus,
  createManualApplication,
  updateApplicationDetails,
  deleteApplication,
} from "@/lib/applications/actions";

beforeEach(() => {
  appCreate.mockClear();
  appUpdateMany.mockClear();
  appUpdate.mockClear();
  appFindFirst.mockReset();
  appDelete.mockClear();
  appCount.mockReset().mockResolvedValue(0);
  jobCreate.mockClear();
  jobUpdate.mockClear();
  jobDelete.mockClear();
});

describe("addApplication (unchanged)", () => {
  it("creates a saved app for the user", async () => {
    await addApplication("j1");
    expect(appCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u1", jobId: "j1", status: "saved" }),
      })
    );
  });
});

describe("updateStatus (unchanged)", () => {
  it("scopes the update to the user", async () => {
    await updateStatus("app1", "applied");
    expect(appUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "app1", userId: "u1" } })
    );
  });
});

describe("createManualApplication", () => {
  it("creates a paste-source job then a linked application", async () => {
    await createManualApplication({
      company: "Stripe",
      title: "Software Engineer",
      status: "applied",
      url: "https://x.co",
      salary: "$180k",
      location: "Remote",
      appliedAt: new Date("2024-05-01"),
      notes: "referred",
    });
    expect(jobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          source: "paste",
          company: "Stripe",
          title: "Software Engineer",
          location: "Remote",
          url: "https://x.co",
          salary: "$180k",
          descriptionText: "",
        }),
      })
    );
    expect(appCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          jobId: "job1",
          status: "applied",
          notes: "referred",
          appliedAt: new Date("2024-05-01"),
        }),
      })
    );
  });

  it("rejects an empty company or title", async () => {
    await expect(
      createManualApplication({ company: "  ", title: "Eng", status: "saved" })
    ).rejects.toThrow(/company/i);
    await expect(
      createManualApplication({ company: "Acme", title: "", status: "saved" })
    ).rejects.toThrow(/role|title/i);
    expect(jobCreate).not.toHaveBeenCalled();
  });

  it("defaults appliedAt to now when status is past 'saved' and no date given", async () => {
    await createManualApplication({ company: "Acme", title: "Eng", status: "applied" });
    const data = appCreate.mock.calls[0][0].data;
    expect(data.appliedAt).toBeInstanceOf(Date);
  });

  it("leaves appliedAt null for a saved application", async () => {
    await createManualApplication({ company: "Acme", title: "Eng", status: "saved" });
    const data = appCreate.mock.calls[0][0].data;
    expect(data.appliedAt).toBeNull();
  });
});

describe("updateApplicationDetails", () => {
  it("updates application fields and the paste job's fields", async () => {
    appFindFirst.mockResolvedValue({
      id: "app1",
      jobId: "job1",
      job: { id: "job1", source: "paste" },
    });
    await updateApplicationDetails("app1", {
      notes: "n",
      appliedAt: new Date("2024-06-01"),
      salary: "$200k",
      location: "NYC",
      url: "https://y.co",
    });
    expect(appUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "app1" },
        data: expect.objectContaining({ notes: "n", appliedAt: new Date("2024-06-01") }),
      })
    );
    expect(jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job1" },
        data: expect.objectContaining({ salary: "$200k", location: "NYC", url: "https://y.co" }),
      })
    );
  });

  it("does NOT edit job fields for an ats-sourced posting", async () => {
    appFindFirst.mockResolvedValue({
      id: "app1",
      jobId: "job1",
      job: { id: "job1", source: "ats" },
    });
    await updateApplicationDetails("app1", { notes: "n" });
    expect(appUpdate).toHaveBeenCalled();
    expect(jobUpdate).not.toHaveBeenCalled();
  });

  it("is a no-op when the application is not owned by the user", async () => {
    appFindFirst.mockResolvedValue(null);
    await updateApplicationDetails("nope", { notes: "n" });
    expect(appUpdate).not.toHaveBeenCalled();
    expect(jobUpdate).not.toHaveBeenCalled();
  });
});

describe("deleteApplication", () => {
  it("deletes the application and an orphaned paste job", async () => {
    appFindFirst.mockResolvedValue({ id: "app1", jobId: "job1", job: { id: "job1", source: "paste" } });
    appCount.mockResolvedValue(0);
    await deleteApplication("app1");
    expect(appDelete).toHaveBeenCalledWith({ where: { id: "app1" } });
    expect(jobDelete).toHaveBeenCalledWith({ where: { id: "job1" } });
  });

  it("keeps a paste job that still has other applications", async () => {
    appFindFirst.mockResolvedValue({ id: "app1", jobId: "job1", job: { id: "job1", source: "paste" } });
    appCount.mockResolvedValue(2);
    await deleteApplication("app1");
    expect(appDelete).toHaveBeenCalled();
    expect(jobDelete).not.toHaveBeenCalled();
  });

  it("never deletes an ats-sourced job", async () => {
    appFindFirst.mockResolvedValue({ id: "app1", jobId: "job1", job: { id: "job1", source: "ats" } });
    appCount.mockResolvedValue(0);
    await deleteApplication("app1");
    expect(appDelete).toHaveBeenCalled();
    expect(jobDelete).not.toHaveBeenCalled();
  });

  it("is a no-op when the application is not owned by the user", async () => {
    appFindFirst.mockResolvedValue(null);
    await deleteApplication("nope");
    expect(appDelete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/applications/actions.test.ts`
Expected: FAIL — `createManualApplication` / `updateApplicationDetails` / `deleteApplication` are not exported.

- [ ] **Step 3: Write minimal implementation**

Replace the entire contents of `src/lib/applications/actions.ts` with:

```typescript
"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Status = "saved" | "applied" | "interviewing" | "offer" | "rejected";

export async function addApplication(jobId: string) {
  const user = await requireUser();
  await prisma.application.create({ data: { userId: user.id, jobId, status: "saved" } });
  revalidatePath("/applications");
}

export async function updateStatus(applicationId: string, status: Status) {
  const user = await requireUser();
  await prisma.application.updateMany({
    where: { id: applicationId, userId: user.id },
    data: { status, appliedAt: status === "applied" ? new Date() : undefined },
  });
  revalidatePath("/applications");
}

export async function updateNotes(applicationId: string, notes: string) {
  const user = await requireUser();
  await prisma.application.updateMany({
    where: { id: applicationId, userId: user.id },
    data: { notes },
  });
  revalidatePath("/applications");
}

export interface ManualApplicationInput {
  company: string;
  title: string;
  status: Status;
  url?: string;
  salary?: string;
  location?: string;
  appliedAt?: Date | null;
  notes?: string;
}

/** Create a paste-source Job + a linked Application for a job the app never ingested. */
export async function createManualApplication(input: ManualApplicationInput) {
  const user = await requireUser();
  const company = input.company.trim();
  const title = input.title.trim();
  if (!company) throw new Error("Company is required.");
  if (!title) throw new Error("Role is required.");

  const appliedAt =
    input.appliedAt ?? (input.status !== "saved" ? new Date() : null);

  const job = await prisma.job.create({
    data: {
      userId: user.id,
      source: "paste",
      company,
      title,
      location: input.location?.trim() || null,
      url: input.url?.trim() || null,
      salary: input.salary?.trim() || null,
      descriptionText: "",
    },
  });

  await prisma.application.create({
    data: {
      userId: user.id,
      jobId: job.id,
      status: input.status,
      notes: input.notes?.trim() || null,
      appliedAt,
    },
  });

  revalidatePath("/applications");
}

export interface ApplicationDetailInput {
  notes?: string;
  appliedAt?: Date | null;
  salary?: string;
  location?: string;
  url?: string;
}

/**
 * Update an application's own fields (notes, appliedAt). Job fields
 * (salary/location/url) are only editable for paste-source jobs — ats
 * postings are treated as immutable shared records.
 */
export async function updateApplicationDetails(
  applicationId: string,
  input: ApplicationDetailInput
) {
  const user = await requireUser();
  const app = await prisma.application.findFirst({
    where: { id: applicationId, userId: user.id },
    include: { job: true },
  });
  if (!app) return;

  await prisma.application.update({
    where: { id: app.id },
    data: { notes: input.notes ?? undefined, appliedAt: input.appliedAt ?? undefined },
  });

  if (app.job.source === "paste") {
    await prisma.job.update({
      where: { id: app.jobId },
      data: {
        salary: input.salary?.trim() || null,
        location: input.location?.trim() || null,
        url: input.url?.trim() || null,
      },
    });
  }

  revalidatePath("/applications");
}

/** Delete an application; clean up its backing paste job if now orphaned. */
export async function deleteApplication(applicationId: string) {
  const user = await requireUser();
  const app = await prisma.application.findFirst({
    where: { id: applicationId, userId: user.id },
    include: { job: true },
  });
  if (!app) return;

  await prisma.application.delete({ where: { id: app.id } });

  if (app.job.source === "paste") {
    const remaining = await prisma.application.count({ where: { jobId: app.jobId } });
    if (remaining === 0) {
      await prisma.job.delete({ where: { id: app.jobId } });
    }
  }

  revalidatePath("/applications");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/applications/actions.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/applications/actions.ts src/lib/applications/actions.test.ts
git commit -m "feat(applications): server actions for manual add, detail edit, delete"
```

---

## Task 3: Base UI Dialog + Menu primitives

**Files:**
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/ui/menu.tsx`

- [ ] **Step 1: Create the Dialog wrapper**

Create `src/components/ui/dialog.tsx`:

```typescript
"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root {...props} />;
}

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger {...props} />;
}

function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close {...props} />;
}

function DialogContent({
  className,
  children,
  ...props
}: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
      <DialogPrimitive.Popup
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-xl outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      className={cn("mt-1 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
};
```

- [ ] **Step 2: Create the Menu wrapper**

Create `src/components/ui/menu.tsx`:

```typescript
"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "@/lib/utils";

function Menu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root {...props} />;
}

function MenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger {...props} />;
}

function MenuContent({
  className,
  children,
  sideOffset = 6,
  ...props
}: MenuPrimitive.Popup.Props & { sideOffset?: number }) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner sideOffset={sideOffset} className="z-50 outline-none">
        <MenuPrimitive.Popup
          className={cn(
            "z-50 min-w-40 origin-(--transform-origin) rounded-xl border border-border bg-card p-1 shadow-lg outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function MenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        className
      )}
      {...props}
    />
  );
}

export { Menu, MenuTrigger, MenuContent, MenuItem };
```

- [ ] **Step 3: Type-check both files**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no errors). If Base UI sub-path prop type names differ (e.g. `Popup.Props`), open `node_modules/@base-ui/react/dialog/index.parts.d.ts` and `.../menu/index.parts.d.ts` and adjust the referenced `*.Props` names to match — the wrapper structure stays the same.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/dialog.tsx src/components/ui/menu.tsx
git commit -m "feat(ui): Base UI dialog and menu primitives"
```

---

## Task 4: StatusPill component

**Files:**
- Create: `src/components/status-pill.tsx`

- [ ] **Step 1: Implement**

Create `src/components/status-pill.tsx`:

```typescript
"use client";

import { KANBAN_COLUMNS } from "@/lib/applications/kanban";
import type { KanbanStatus } from "@/lib/applications/kanban";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "@/components/ui/menu";
import { cn } from "@/lib/utils";

const STYLES: Record<KanbanStatus, { pill: string; dot: string }> = {
  saved: { pill: "bg-[#f0f1f5] text-[#5b6275]", dot: "bg-[#9aa0b0]" },
  applied: { pill: "bg-accent text-accent-foreground", dot: "bg-[#7c63ec]" },
  interviewing: { pill: "bg-[#fdf4d8] text-[#9a7212]", dot: "bg-[#e0a818]" },
  offer: { pill: "bg-[#def6e0] text-[#268a3a]", dot: "bg-[#3bbf52]" },
  rejected: { pill: "bg-[#f8e6e6] text-[#b14a4a]", dot: "bg-[#d57272]" },
};

const LABELS: Record<KanbanStatus, string> = Object.fromEntries(
  KANBAN_COLUMNS.map((c) => [c.status, c.label])
) as Record<KanbanStatus, string>;

interface StatusPillProps {
  status: KanbanStatus;
  onChange: (next: KanbanStatus) => void;
  disabled?: boolean;
}

export function StatusPill({ status, onChange, disabled }: StatusPillProps) {
  const style = STYLES[status];
  return (
    <Menu>
      <MenuTrigger
        disabled={disabled}
        aria-label={`Status: ${LABELS[status]}. Click to change.`}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
          style.pill
        )}
      >
        <span className={cn("size-1.5 rounded-full", style.dot)} />
        {LABELS[status]}
      </MenuTrigger>
      <MenuContent>
        {KANBAN_COLUMNS.map(({ status: s, label }) => (
          <MenuItem key={s} onClick={() => onChange(s)}>
            <span className={cn("size-1.5 rounded-full", STYLES[s].dot)} />
            {label}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/status-pill.tsx
git commit -m "feat(applications): inline status pill with menu"
```

---

## Task 5: ApplicationStatTiles component

**Files:**
- Create: `src/components/application-stat-tiles.tsx`

- [ ] **Step 1: Implement**

Create `src/components/application-stat-tiles.tsx`:

```typescript
import type { ApplicationSummary } from "@/lib/applications/table";

const TILES: { key: keyof ApplicationSummary; label: string; accent?: boolean }[] = [
  { key: "total", label: "Total tracked" },
  { key: "applied", label: "Applied" },
  { key: "interviewing", label: "Interviewing" },
  { key: "offers", label: "Offers", accent: true },
];

export function ApplicationStatTiles({ summary }: { summary: ApplicationSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {TILES.map(({ key, label, accent }) => (
        <div
          key={key}
          className={`rounded-2xl border border-border p-4 ${
            accent ? "bg-gradient-to-br from-accent to-card" : "bg-card"
          }`}
        >
          <div className="text-2xl font-extrabold tracking-tight tabular-nums">
            {summary[key]}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/application-stat-tiles.tsx
git commit -m "feat(applications): summary stat tiles (counts only)"
```

---

## Task 6: AddJobDialog component

**Files:**
- Create: `src/components/add-job-dialog.tsx`

- [ ] **Step 1: Implement**

Create `src/components/add-job-dialog.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { KANBAN_COLUMNS } from "@/lib/applications/kanban";
import type { KanbanStatus } from "@/lib/applications/kanban";
import { createManualApplication } from "@/lib/applications/actions";

export function AddJobDialog({
  trigger,
}: {
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const company = String(fd.get("company") ?? "").trim();
    const title = String(fd.get("title") ?? "").trim();
    if (!company || !title) {
      setError("Company and role are required.");
      return;
    }
    const appliedAtRaw = String(fd.get("appliedAt") ?? "");
    setError(null);
    startTransition(async () => {
      try {
        await createManualApplication({
          company,
          title,
          status: String(fd.get("status")) as KanbanStatus,
          url: String(fd.get("url") ?? ""),
          salary: String(fd.get("salary") ?? ""),
          location: String(fd.get("location") ?? ""),
          appliedAt: appliedAtRaw ? new Date(appliedAtRaw) : null,
          notes: String(fd.get("notes") ?? ""),
        });
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add the job.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ? (
            (trigger as React.ReactElement)
          ) : (
            <Button>
              <Plus data-icon="inline-start" /> Add job
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogTitle>Add a job</DialogTitle>
        <DialogDescription>
          Track a role you applied to anywhere — it doesn’t have to come from this app.
        </DialogDescription>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <Field label="Company *">
            <Input name="company" required placeholder="Stripe" />
          </Field>
          <Field label="Role *">
            <Input name="title" required placeholder="Software Engineer" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select
                name="status"
                defaultValue="applied"
                className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
              >
                {KANBAN_COLUMNS.map((c) => (
                  <option key={c.status} value={c.status}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Applied date">
              <Input name="appliedAt" type="date" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Salary">
              <Input name="salary" placeholder="$180k" />
            </Field>
            <Field label="Location">
              <Input name="location" placeholder="Remote" />
            </Field>
          </div>
          <Field label="Job URL">
            <Input name="url" type="url" placeholder="https://…" />
          </Field>
          <Field label="Notes">
            <Textarea name="notes" placeholder="Anything worth remembering…" className="min-h-16" />
          </Field>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="ghost">Cancel</Button>} />
            <Button type="submit" disabled={isPending}>
              {isPending ? "Adding…" : "Add job"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS. If `DialogTrigger`/`DialogClose` `render` prop typing rejects the element, wrap the child per Base UI's render-prop convention used in `application-card.tsx` (`render={<div />}`) — confirm against `node_modules/@base-ui/react/dialog/index.parts.d.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/components/add-job-dialog.tsx
git commit -m "feat(applications): manual Add Job dialog"
```

---

## Task 7: ApplicationDetailPanel component

**Files:**
- Create: `src/components/application-detail-panel.tsx`

- [ ] **Step 1: Implement**

Create `src/components/application-detail-panel.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  updateApplicationDetails,
  deleteApplication,
} from "@/lib/applications/actions";
import type { AppWithJob } from "@/app/(app)/applications/page";

function toDateInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

interface DetailProps {
  app: AppWithJob | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApplicationDetailPanel({ app, open, onOpenChange }: DetailProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!app) return null;
  const isPaste = app.job.source === "paste";

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const appliedAtRaw = String(fd.get("appliedAt") ?? "");
    setError(null);
    startTransition(async () => {
      try {
        await updateApplicationDetails(app!.id, {
          notes: String(fd.get("notes") ?? ""),
          appliedAt: appliedAtRaw ? new Date(appliedAtRaw) : null,
          salary: String(fd.get("salary") ?? ""),
          location: String(fd.get("location") ?? ""),
          url: String(fd.get("url") ?? ""),
        });
        onOpenChange(false);
      } catch {
        setError("Could not save changes.");
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteApplication(app!.id);
        onOpenChange(false);
      } catch {
        setError("Could not delete this application.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{app.job.title}</DialogTitle>
        <p className="mt-0.5 text-sm text-muted-foreground">{app.job.company}</p>

        <form onSubmit={handleSave} className="mt-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Applied date">
              <Input name="appliedAt" type="date" defaultValue={toDateInput(app.appliedAt)} />
            </Field>
            <Field label="Salary">
              <Input name="salary" defaultValue={app.job.salary ?? ""} disabled={!isPaste} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Location">
              <Input name="location" defaultValue={app.job.location ?? ""} disabled={!isPaste} />
            </Field>
            <Field label="Job URL">
              <Input name="url" type="url" defaultValue={app.job.url ?? ""} disabled={!isPaste} />
            </Field>
          </div>
          {!isPaste && (
            <p className="text-xs text-muted-foreground">
              This posting came from a job board, so its details are read-only. You can still edit notes and dates.
            </p>
          )}
          <Field label="Notes">
            <Textarea name="notes" defaultValue={app.notes ?? ""} className="min-h-20" />
          </Field>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="mt-2 flex items-center justify-between">
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending}>
              <Trash2 data-icon="inline-start" /> Delete
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/application-detail-panel.tsx
git commit -m "feat(applications): application detail edit/delete dialog"
```

---

## Task 8: ApplicationsTable (toolbar + table + rows + wiring)

**Files:**
- Create: `src/components/applications-table.tsx`
- Test: `src/components/applications-table.test.tsx`

- [ ] **Step 1: Write the failing render test**

Create `src/components/applications-table.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AppWithJob } from "@/app/(app)/applications/page";
import { ApplicationsTable } from "./applications-table";

// Server actions are not callable in jsdom; stub the module.
vi.mock("@/lib/applications/actions", () => ({
  updateStatus: vi.fn(),
  createManualApplication: vi.fn(),
  updateApplicationDetails: vi.fn(),
  deleteApplication: vi.fn(),
}));

function makeApp(id: string, status: string, company: string): AppWithJob {
  return {
    id,
    status,
    userId: "u1",
    jobId: `j-${id}`,
    notes: null,
    appliedAt: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    job: {
      id: `j-${id}`,
      title: `Role ${id}`,
      company,
      location: null,
      url: null,
      salary: null,
      source: "paste",
    },
  } as unknown as AppWithJob;
}

describe("ApplicationsTable", () => {
  it("renders a row per application", () => {
    render(
      <ApplicationsTable
        applications={[makeApp("1", "applied", "Stripe"), makeApp("2", "saved", "Ramp")]}
      />
    );
    expect(screen.getByText("Stripe")).toBeInTheDocument();
    expect(screen.getByText("Ramp")).toBeInTheDocument();
  });

  it("shows the empty state when there are no applications", () => {
    render(<ApplicationsTable applications={[]} />);
    expect(screen.getByText(/no applications yet/i)).toBeInTheDocument();
  });

  it("renders the stat tiles", () => {
    render(<ApplicationsTable applications={[makeApp("1", "applied", "Stripe")]} />);
    expect(screen.getByText("Total tracked")).toBeInTheDocument();
    expect(screen.getByText("Offers")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/applications-table.test.tsx`
Expected: FAIL — cannot resolve `./applications-table`.

- [ ] **Step 3: Implement the component**

Create `src/components/applications-table.tsx`:

```typescript
"use client";

import { useState, useTransition, useEffect, useRef, useMemo } from "react";
import { Search } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/empty-state";
import { ApplicationStatTiles } from "@/components/application-stat-tiles";
import { StatusPill } from "@/components/status-pill";
import { AddJobDialog } from "@/components/add-job-dialog";
import { ApplicationDetailPanel } from "@/components/application-detail-panel";
import { updateStatus } from "@/lib/applications/actions";
import {
  filterApplications,
  sortApplications,
  summarize,
  type TableFilter,
  type TableSort,
} from "@/lib/applications/table";
import type { KanbanStatus } from "@/lib/applications/kanban";
import type { AppWithJob } from "@/app/(app)/applications/page";
import { cn } from "@/lib/utils";

const FILTERS: { key: TableFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "saved", label: "Saved" },
];

const SORTS: { key: TableSort; label: string }[] = [
  { key: "lastActivity", label: "Last activity" },
  { key: "applied", label: "Applied date" },
  { key: "company", label: "Company" },
];

function relative(date: Date): string {
  const days = Math.round((Date.now() - new Date(date).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function absolute(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function logoColor(company: string): string {
  const palette = ["#635bff", "#1a1a1a", "#0c8a4b", "#d6409f", "#e0a818", "#2563eb"];
  let h = 0;
  for (const ch of company) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

export function ApplicationsTable({ applications }: { applications: AppWithJob[] }) {
  const [apps, setApps] = useState(applications);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TableFilter>("all");
  const [sort, setSort] = useState<TableSort>("lastActivity");
  const [detail, setDetail] = useState<AppWithJob | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const pendingRef = useRef(0);

  useEffect(() => {
    if (pendingRef.current === 0) setApps(applications);
  }, [applications]);

  const rows = useMemo(
    () => sortApplications(filterApplications(apps, { search, filter }), sort),
    [apps, search, filter, sort]
  );
  const summary = useMemo(() => summarize(apps), [apps]);

  function handleStatus(app: AppWithJob, next: KanbanStatus) {
    if (app.status === next) return;
    const snapshot = apps;
    setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, status: next } : a)));
    setError(null);
    pendingRef.current++;
    startTransition(async () => {
      try {
        await updateStatus(app.id, next);
      } catch {
        setApps(snapshot);
        setError("Failed to update status. Please try again.");
      } finally {
        pendingRef.current--;
      }
    });
  }

  function openDetail(app: AppWithJob) {
    setDetail(app);
    setDetailOpen(true);
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-5">
        <ApplicationStatTiles summary={summary} />

        {error && (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company or role…"
              aria-label="Search applications"
              className="h-9 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs font-semibold transition",
                filter === f.key
                  ? "border-primary/30 bg-accent text-accent-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {f.label}
            </button>
          ))}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as TableSort)}
            aria-label="Sort applications"
            className="h-9 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                Sort: {s.label}
              </option>
            ))}
          </select>
          <AddJobDialog />
        </div>

        {/* Table or empty state */}
        {apps.length === 0 ? (
          <EmptyState
            title="No applications yet"
            message="Track a role you applied to anywhere — it doesn’t have to come from this app."
            action={<AddJobDialog />}
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Company / Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Applied</th>
                  <th className="px-4 py-3">Salary</th>
                  <th className="px-4 py-3">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((app) => (
                  <tr
                    key={app.id}
                    onClick={() => openDetail(app)}
                    className="cursor-pointer border-t border-border/60 text-sm transition hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="grid size-9 shrink-0 place-items-center rounded-xl text-sm font-bold text-white"
                          style={{ background: logoColor(app.job.company) }}
                          aria-hidden
                        >
                          {app.job.company.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <div className="font-semibold">{app.job.company}</div>
                          <div className="text-xs text-muted-foreground">{app.job.title}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <StatusPill
                        status={app.status as KanbanStatus}
                        onChange={(next) => handleStatus(app, next)}
                      />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{absolute(app.appliedAt)}</td>
                    <td className="px-4 py-3 font-medium">{app.job.salary ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{relative(app.updatedAt)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No applications match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ApplicationDetailPanel app={detail} open={detailOpen} onOpenChange={setDetailOpen} />
    </TooltipProvider>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/applications-table.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/applications-table.tsx src/components/applications-table.test.tsx
git commit -m "feat(applications): power table with search, filter, sort, inline status"
```

---

## Task 9: Page rewrite (hero header + table)

**Files:**
- Modify: `src/app/(app)/applications/page.tsx`

- [ ] **Step 1: Replace the page body**

Replace the entire contents of `src/app/(app)/applications/page.tsx` with:

```typescript
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApplicationsTable } from "@/components/applications-table";
import { AddJobDialog } from "@/components/add-job-dialog";

export const dynamic = "force-dynamic";

export type AppWithJob = Prisma.ApplicationGetPayload<{ include: { job: true } }>;

export default async function ApplicationsPage() {
  const user = await requireUser();
  const apps = await prisma.application.findMany({
    where: { userId: user.id },
    include: { job: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Tracker</p>
          <h1 className="text-3xl font-extrabold tracking-tight">Applications</h1>
          <p className="text-muted-foreground mt-1">
            Every role you’re chasing — in one place that beats a spreadsheet.
          </p>
        </div>
        <AddJobDialog />
      </div>
      <ApplicationsTable applications={apps} />
    </div>
  );
}
```

> Note: `AppWithJob` is still exported from this file — `table.ts`, `status-pill`, `applications-table`, and the kanban modules all import it from here, so the export must remain.

- [ ] **Step 2: Verify the whole suite + types still pass**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: PASS. The dormant `kanban.test.ts` still imports `AppWithJob` from this file and stays green.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/applications/page.tsx"
git commit -m "feat(applications): replace kanban board with power table + hero header"
```

---

## Task 10: Sidebar reorder

**Files:**
- Modify: `src/components/app-nav.tsx`

- [ ] **Step 1: Reorder `navItems`**

In `src/components/app-nav.tsx`, change the `navItems` array (currently Dashboard, Resume, Profile, Jobs, Applications) to put Applications second:

```typescript
const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/applications", label: "Applications", icon: ClipboardList },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/resume", label: "Resume", icon: FileText },
  { href: "/profile", label: "Profile", icon: UserRound },
] as const;
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/app-nav.tsx
git commit -m "feat(nav): promote Applications to the 2nd sidebar slot"
```

---

## Task 11: E2E flow

**Files:**
- Modify: `e2e/applications.spec.ts`

> The existing e2e suite only tests the unauthenticated redirect (no seeded session is available). Keep that test and add an authenticated-flow test **guarded** so it skips cleanly when no test session is configured, matching how the repo currently avoids requiring a live login. If the repo gains a seeded-auth helper later, this test activates.

- [ ] **Step 1: Append the guarded flow test**

Add to the bottom of `e2e/applications.spec.ts`:

```typescript
import { existsSync } from "node:fs";

// Authenticated flow — only runs when a Playwright storage state is present.
const STORAGE = "e2e/.auth/state.json";
const authed = existsSync(STORAGE);

test.describe("applications power table (authenticated)", () => {
  test.skip(!authed, "no seeded auth state; skipping authenticated flow");
  test.use({ storageState: STORAGE });

  test("add a job manually, change status, then delete it", async ({ page }) => {
    await page.goto("/applications");

    // Add
    await page.getByRole("button", { name: /add job/i }).first().click();
    await page.getByLabel(/company/i).fill("Playwright Co");
    await page.getByLabel(/role/i).fill("E2E Engineer");
    await page.getByRole("button", { name: /^add job$/i }).click();
    await expect(page.getByText("Playwright Co")).toBeVisible();

    // Open detail + delete
    await page.getByText("Playwright Co").click();
    await page.getByRole("button", { name: /delete/i }).click();
    await expect(page.getByText("Playwright Co")).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run e2e to confirm it doesn't break the suite**

Run: `pnpm e2e e2e/applications.spec.ts`
Expected: the redirect test PASSES; the authenticated test is SKIPPED (no storage state). No failures.

- [ ] **Step 3: Commit**

```bash
git add e2e/applications.spec.ts
git commit -m "test(applications): guarded e2e for manual add + delete flow"
```

---

## Task 12: Full verification + manual smoke

- [ ] **Step 1: Run the full unit suite and type-check**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: ALL PASS. Confirm `table.test.ts`, `actions.test.ts`, `applications-table.test.tsx`, and the still-green `kanban.test.ts` all pass.

- [ ] **Step 2: Production build**

Run: `pnpm build`
Expected: build succeeds with no type errors.

- [ ] **Step 3: Manual smoke in dev**

Run: `pnpm dev` (port 3050). Log in, open `/applications`, and confirm:
- Applications sits 2nd in the sidebar.
- Stat tiles show counts (Total · Applied · Interviewing · Offers) — no "response rate".
- "Add job" opens the dialog; adding a row makes it appear in the table.
- The status pill changes status inline; the change persists on refresh.
- Clicking a row opens the detail dialog; editing salary/notes saves; ats rows have read-only job fields.
- Deleting a manually-added row removes it.
- Search, the All/Active/Saved chips, and the sort dropdown all work.

- [ ] **Step 4: Final commit (if any smoke fixes were needed)**

```bash
git add -A
git commit -m "fix(applications): polish from manual smoke pass"
```

---

## Self-Review notes

- **Spec coverage:** power table (Tasks 8–9) · manual add (Tasks 2, 6) · 2nd sidebar slot (Task 10) · status/notes parity (Tasks 4, 7) · stat tiles counts-only/no response rate (Tasks 1, 5) · filter/sort/search (Tasks 1, 8) · delete with orphan cleanup (Task 2) · Kanban dropped-but-retained (Task 9 stops importing it; files untouched) · Base UI primitives matching existing stack (Task 3). All spec sections map to a task.
- **Type consistency:** `AppWithJob` is sourced from `app/(app)/applications/page.tsx` everywhere; `KanbanStatus`/`KANBAN_COLUMNS` reused for the status union and labels; `TableFilter`/`TableSort`/`ApplicationSummary` defined in `table.ts` and imported unchanged by `applications-table.tsx` and `application-stat-tiles.tsx`; action input types (`ManualApplicationInput`, `ApplicationDetailInput`) defined in `actions.ts` and matched by the dialog callers.
- **No placeholders:** every code step contains full, runnable code.
```
