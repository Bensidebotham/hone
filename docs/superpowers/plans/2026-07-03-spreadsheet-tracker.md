# Spreadsheet Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Hone's applications table into a spreadsheet-grade editor — inline cell editing, keyboard navigation, bulk actions, and per-user column configuration — with four new job-native columns.

**Architecture:** A custom grid built on the existing `<table>` (no data-grid library). Pure logic (column catalog + resolver, grid-navigation reducer, range selection, sorting) lives in `lib/applications/` and is unit-tested; the React layer lives in `components/spreadsheet/`. Editing uses the existing per-row optimistic-update pattern + Server Actions.

**Tech Stack:** Next.js 16 (App Router, RSC + Server Actions), React 19, Prisma 7 + Neon Postgres, `@dnd-kit` (already a dep) for column reorder, Tailwind v4 + Base UI, Vitest + Testing Library.

## Global Constraints

- NON-standard Next.js 16 build — consult `node_modules/next/dist/docs/` before writing App Router code (per `AGENTS.md`).
- Work directly on `main` (user preference — no feature branch). Commit per task. Git identity is configured locally in this repo.
- No new heavy dependencies — build the grid custom (approach A). `@dnd-kit/*` (already present) is the only library used, for column reorder.
- Migration is **additive** (nullable columns) — do NOT reset the database.
- `ApplicationRow` stays `= Application` (from `@prisma/client`), exported from `src/app/(app)/applications/page.tsx`.
- Status is the only field that records an `ApplicationEvent`; scalar field edits do not.
- The status source of truth is `src/lib/applications/kanban.ts` (`KANBAN_STATUSES`, `KANBAN_COLUMNS`, `KanbanStatus`, `isKanbanStatus`) — keep it; reuse `StatusPill`.
- Definition of green: `npx tsc --noEmit`, `npm test`, and `next build` all pass. (Note: one pre-existing unrelated failure, `src/app/api/resume/upload/route.test.ts` — an undici/File test-env issue — is expected to remain red and is NOT introduced by this work.)
- tsc file-extraction note: paths contain `(app)`, which breaks a naive grep — use `grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\): error.*//' | sort -u`.

## File Structure

- `prisma/schema.prisma` — 4 new `Application` columns + `User.applicationTablePrefs`.
- `src/lib/applications/columns.ts` — column catalog, `ColumnId`, `ColumnDef`, `TablePrefs`, `resolveColumns`, `DEFAULT_VISIBLE`.
- `src/lib/applications/grid-nav.ts` — pure grid-navigation reducer (`GridState`, `GridAction`, `reduceGrid`).
- `src/lib/applications/selection.ts` — pure `rangeIds` helper.
- `src/lib/applications/table.ts` — extend `TableSort` + `sortApplications` for new columns (existing file).
- `src/lib/applications/actions.ts` — `updateApplicationFields`, `bulkUpdateStatus`, `bulkMarkApplied`, `bulkDelete`, `saveColumnPrefs` (existing file).
- `src/components/spreadsheet/application-spreadsheet.tsx` — top-level (replaces `applications-table.tsx`).
- `src/components/spreadsheet/spreadsheet-cell.tsx` — one cell (display/edit by kind).
- `src/components/spreadsheet/spreadsheet-row.tsx` — checkbox + cells + expand.
- `src/components/spreadsheet/column-menu.tsx` — show/hide + drag-reorder.
- `src/components/spreadsheet/bulk-action-bar.tsx` — selection actions.
- `src/app/(app)/applications/page.tsx` + `loading.tsx` — integration.
- Deletions: `applications-table.tsx`, `application-kanban.tsx` (+tests), dead helpers in `kanban.ts`.

---

### Task 1: Schema — new columns + column prefs

**Files:**
- Modify: `prisma/schema.prisma`
- Create: generated migration under `prisma/migrations/`

**Interfaces:**
- Produces: `Application.followUpDate: DateTime?`, `.source: String?`, `.contact: String?`, `.nextStep: String?`; `User.applicationTablePrefs: Json?`.

- [ ] **Step 1: Add the Application columns**

In `prisma/schema.prisma`, in `model Application`, after the `salary String?` line add:

```prisma
  followUpDate DateTime?
  source       String?
  contact      String?
  nextStep     String?
```

- [ ] **Step 2: Add the User prefs column**

In `model User`, after `lastDashboardVisitAt DateTime?` add:

```prisma
  applicationTablePrefs Json?
```

- [ ] **Step 3: Validate**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Create + apply the additive migration**

Run: `npx prisma migrate dev --name add_tracker_columns_and_prefs`
Expected: migration applies cleanly (all columns nullable → no data loss, no reset). Prisma Client regenerates.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): add follow-up/source/contact/next-step + column prefs"
```

---

### Task 2: Column catalog + resolver

**Files:**
- Create: `src/lib/applications/columns.ts`
- Test: `src/lib/applications/columns.test.ts`

**Interfaces:**
- Produces:
  - `type ColumnId = "company"|"role"|"status"|"appliedAt"|"followUpDate"|"salary"|"source"|"contact"|"nextStep"|"location"|"url"|"notes"|"lastActivity"`
  - `type ColumnKind = "company"|"role"|"status"|"date"|"text"|"lastActivity"`
  - `interface ColumnDef { id: ColumnId; label: string; kind: ColumnKind; field?: keyof Application; editable: boolean; sortable: boolean }`
  - `interface TablePrefs { order?: ColumnId[]; hidden?: ColumnId[] }`
  - `const CATALOG: ColumnDef[]`, `const DEFAULT_VISIBLE: ColumnId[]`
  - `function resolveColumns(prefs: TablePrefs | null | undefined): ColumnDef[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/applications/columns.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveColumns, CATALOG, DEFAULT_VISIBLE, type TablePrefs } from "./columns";

const ids = (cols: { id: string }[]) => cols.map((c) => c.id);

describe("resolveColumns", () => {
  it("returns the default-visible set (in order) when prefs is null", () => {
    expect(ids(resolveColumns(null))).toEqual(DEFAULT_VISIBLE);
  });

  it("treats empty prefs as default", () => {
    expect(ids(resolveColumns({}))).toEqual(DEFAULT_VISIBLE);
    expect(ids(resolveColumns({ order: [], hidden: [] }))).toEqual(DEFAULT_VISIBLE);
  });

  it("applies an explicit order and appends unmentioned catalog columns after it", () => {
    const prefs: TablePrefs = { order: ["status", "company"], hidden: [] };
    const result = ids(resolveColumns(prefs));
    expect(result.slice(0, 2)).toEqual(["status", "company"]);
    // every catalog column present exactly once
    expect(new Set(result).size).toBe(result.length);
    expect(result).toContain("lastActivity");
  });

  it("removes hidden columns", () => {
    const prefs: TablePrefs = { order: ["company", "role", "status"], hidden: ["role"] };
    expect(ids(resolveColumns(prefs))).not.toContain("role");
    expect(ids(resolveColumns(prefs))).toContain("company");
  });

  it("ignores unknown ids in order and hidden", () => {
    const prefs = { order: ["company", "bogus"], hidden: ["nope"] } as unknown as TablePrefs;
    const result = ids(resolveColumns(prefs));
    expect(result).not.toContain("bogus");
    expect(result[0]).toBe("company");
  });

  it("keeps a new catalog column visible by default (not in order, not hidden)", () => {
    // Simulate: user ordered only a subset; a column they never mentioned still shows.
    const prefs: TablePrefs = { order: ["company"], hidden: ["notes"] };
    const result = ids(resolveColumns(prefs));
    expect(result).toContain("salary"); // unmentioned → appended visible
    expect(result).not.toContain("notes"); // explicitly hidden
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/applications/columns.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `columns.ts`**

```ts
import type { Application } from "@prisma/client";

export type ColumnId =
  | "company" | "role" | "status" | "appliedAt" | "followUpDate"
  | "salary" | "source" | "contact" | "nextStep" | "location"
  | "url" | "notes" | "lastActivity";

export type ColumnKind = "company" | "role" | "status" | "date" | "text" | "lastActivity";

export interface ColumnDef {
  id: ColumnId;
  label: string;
  kind: ColumnKind;
  field?: keyof Application; // the Application field this reads/writes
  editable: boolean;
  sortable: boolean;
}

export interface TablePrefs {
  order?: ColumnId[];
  hidden?: ColumnId[];
}

export const CATALOG: ColumnDef[] = [
  { id: "company", label: "Company", kind: "company", field: "company", editable: true, sortable: true },
  { id: "role", label: "Role", kind: "role", field: "title", editable: true, sortable: true },
  { id: "status", label: "Status", kind: "status", field: "status", editable: true, sortable: true },
  { id: "appliedAt", label: "Applied", kind: "date", field: "appliedAt", editable: true, sortable: true },
  { id: "followUpDate", label: "Follow-up", kind: "date", field: "followUpDate", editable: true, sortable: true },
  { id: "salary", label: "Salary", kind: "text", field: "salary", editable: true, sortable: true },
  { id: "source", label: "Source", kind: "text", field: "source", editable: true, sortable: true },
  { id: "contact", label: "Contact", kind: "text", field: "contact", editable: true, sortable: true },
  { id: "nextStep", label: "Next step", kind: "text", field: "nextStep", editable: true, sortable: true },
  { id: "location", label: "Location", kind: "text", field: "location", editable: true, sortable: true },
  { id: "url", label: "URL", kind: "text", field: "url", editable: true, sortable: true },
  { id: "notes", label: "Notes", kind: "text", field: "notes", editable: true, sortable: false },
  { id: "lastActivity", label: "Last activity", kind: "lastActivity", editable: false, sortable: true },
];

export const DEFAULT_VISIBLE: ColumnId[] = [
  "company", "role", "status", "appliedAt", "followUpDate", "salary", "source", "lastActivity",
];

const ALL_IDS = CATALOG.map((c) => c.id);

export function resolveColumns(prefs: TablePrefs | null | undefined): ColumnDef[] {
  const byId = new Map(CATALOG.map((c) => [c.id, c]));
  const valid = (ids?: ColumnId[]) => (ids ?? []).filter((id) => byId.has(id));

  const order = valid(prefs?.order);
  const hidden = valid(prefs?.hidden);

  // No meaningful prefs → defaults.
  if (order.length === 0 && hidden.length === 0) {
    return DEFAULT_VISIBLE.map((id) => byId.get(id)!);
  }

  const mentioned = new Set(order);
  const fullOrder: ColumnId[] = [...order, ...ALL_IDS.filter((id) => !mentioned.has(id))];
  const hiddenSet = new Set(hidden);
  return fullOrder.filter((id) => !hiddenSet.has(id)).map((id) => byId.get(id)!);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/applications/columns.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/applications/columns.ts src/lib/applications/columns.test.ts
git commit -m "feat(applications): column catalog + prefs resolver"
```

---

### Task 3: Extend table sorting for the new columns

**Files:**
- Modify: `src/lib/applications/table.ts`
- Modify: `src/lib/applications/table.test.ts`

**Interfaces:**
- Produces: `TableSort` widened to include `"followUpDate" | "source" | "contact" | "nextStep"`; `sortApplications` handles them.

- [ ] **Step 1: Add failing tests**

Append to `src/lib/applications/table.test.ts` (mirror the existing fixture style; each app needs the new fields):

```ts
describe("sortApplications — new columns", () => {
  const base = (over: Partial<ApplicationRow>): ApplicationRow => ({
    id: "x", userId: "u", company: "C", title: "T", url: null, location: null,
    salary: null, description: null, status: "applied", notes: null,
    appliedAt: null, followUpDate: null, source: null, contact: null, nextStep: null,
    createdAt: new Date(0), updatedAt: new Date(0), ...over,
  } as ApplicationRow);

  it("sorts followUpDate ascending with nulls last", () => {
    const rows = [
      base({ id: "none", followUpDate: null }),
      base({ id: "late", followUpDate: new Date("2026-08-01") }),
      base({ id: "soon", followUpDate: new Date("2026-07-10") }),
    ];
    expect(sortApplications(rows, "followUpDate", "asc").map((r) => r.id)).toEqual(["soon", "late", "none"]);
  });

  it("sorts source lexically", () => {
    const rows = [base({ id: "b", source: "Referral" }), base({ id: "a", source: "LinkedIn" })];
    expect(sortApplications(rows, "source", "asc").map((r) => r.id)).toEqual(["a", "b"]);
  });
});
```

(If `ApplicationRow` isn't imported in the test file, add `import type { ApplicationRow } from "@/app/(app)/applications/page";`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/applications/table.test.ts`
Expected: FAIL (type error / wrong order — `followUpDate`/`source` not handled).

- [ ] **Step 3: Extend `table.ts`**

Widen the type and `DEFAULT_DIR`:

```ts
export type TableSort =
  | "company" | "status" | "applied" | "salary" | "lastActivity"
  | "followUpDate" | "source" | "contact" | "nextStep";

export const DEFAULT_DIR: Record<TableSort, SortDir> = {
  company: "asc", status: "asc", applied: "desc", salary: "desc", lastActivity: "desc",
  followUpDate: "asc", source: "asc", contact: "asc", nextStep: "asc",
};
```

Add a lexical helper near `nullsLast`:

```ts
/** Case-insensitive lexical compare, nulls/empties last in both directions. */
function lexNullsLast(a: string | null, b: string | null, flip: number): number {
  const av = a?.trim() ? a.toLowerCase() : null;
  const bv = b?.trim() ? b.toLowerCase() : null;
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  return flip * av.localeCompare(bv);
}
```

Add cases to `sortApplications`'s `switch` (before `lastActivity`):

```ts
    case "followUpDate":
      return copy.sort((a, b) =>
        nullsLast(a.followUpDate?.getTime() ?? null, b.followUpDate?.getTime() ?? null, flip)
      );
    case "source":
      return copy.sort((a, b) => lexNullsLast(a.source, b.source, flip));
    case "contact":
      return copy.sort((a, b) => lexNullsLast(a.contact, b.contact, flip));
    case "nextStep":
      return copy.sort((a, b) => lexNullsLast(a.nextStep, b.nextStep, flip));
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/applications/table.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/applications/table.ts src/lib/applications/table.test.ts
git commit -m "feat(applications): sort by follow-up/source/contact/next-step"
```

---

### Task 4: Server actions — field edit, bulk, prefs

**Files:**
- Modify: `src/lib/applications/actions.ts`
- Modify: `src/lib/applications/actions.test.ts`
- Modify: `src/components/application-detail-panel.tsx` (rename the action it calls)

**Interfaces:**
- Produces:
  - `interface ApplicationFieldsInput { company?; title?; salary?; location?; url?; source?; contact?; nextStep?; notes?; description?; appliedAt?: Date|null; followUpDate?: Date|null }` (all string fields optional `string`)
  - `updateApplicationFields(applicationId: string, input: ApplicationFieldsInput): Promise<void>`
  - `bulkUpdateStatus(ids: string[], status: Status): Promise<void>`
  - `bulkMarkApplied(ids: string[]): Promise<void>`
  - `bulkDelete(ids: string[]): Promise<void>`
  - `saveColumnPrefs(prefs: { order?: string[]; hidden?: string[] }): Promise<void>`
- Removes: `updateApplicationDetails` / `ApplicationDetailInput` (replaced by `updateApplicationFields`).

- [ ] **Step 1: Update the tests**

In `src/lib/applications/actions.test.ts`, replace the `updateApplicationDetails` tests with `updateApplicationFields` tests and add bulk/prefs tests. Mirror the existing `vi.mock("@/lib/db", …)` style; add mock methods for `application.findMany`, `application.update`, `application.deleteMany`, `user.update`. Concretely assert:

```ts
it("updateApplicationFields writes only provided fields, trimming empties to null", async () => {
  appFindFirst.mockResolvedValue({ id: "a1" });
  await updateApplicationFields("a1", { salary: " $180k ", source: "", followUpDate: null });
  expect(appUpdate).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: "a1" },
    data: expect.objectContaining({ salary: "$180k", source: null, followUpDate: null }),
  }));
  const data = appUpdate.mock.calls[0][0].data;
  expect(data.location).toBeUndefined(); // omitted field not touched
});

it("updateApplicationFields does not blank a required company/title when passed empty", async () => {
  appFindFirst.mockResolvedValue({ id: "a1" });
  await updateApplicationFields("a1", { company: "   " });
  expect(appUpdate.mock.calls[0][0].data.company).toBeUndefined();
});

it("bulkUpdateStatus records an event per changed app and skips no-ops", async () => {
  appFindMany.mockResolvedValue([{ id: "a1", status: "saved" }, { id: "a2", status: "applied" }]);
  await bulkUpdateStatus(["a1", "a2"], "applied");
  expect(appUpdate).toHaveBeenCalledTimes(1); // a2 already applied → skipped
  expect(recordEvent).toHaveBeenCalledTimes(1);
});

it("bulkDelete scopes to the user", async () => {
  await bulkDelete(["a1", "a2"]);
  expect(appDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a1", "a2"] }, userId: "u1" } });
});

it("saveColumnPrefs writes the blob", async () => {
  await saveColumnPrefs({ order: ["company"], hidden: ["notes"] });
  expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { applicationTablePrefs: { order: ["company"], hidden: ["notes"] } } });
});
```

(Use whatever mock variable names the file already establishes; add `appFindMany`, `appDeleteMany`, `userUpdate`, `recordEvent` to the mock setup consistent with existing style.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/applications/actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite the actions**

In `src/lib/applications/actions.ts`, replace the `ApplicationDetailInput` interface and `updateApplicationDetails` function with:

```ts
export interface ApplicationFieldsInput {
  company?: string;
  title?: string;
  salary?: string;
  location?: string;
  url?: string;
  source?: string;
  contact?: string;
  nextStep?: string;
  notes?: string;
  description?: string;
  appliedAt?: Date | null;
  followUpDate?: Date | null;
}

const trimOrNull = (v?: string) => (v === undefined ? undefined : v.trim() || null);
// Required fields: never blank them via inline edit — skip an empty value.
const keepIfNonEmpty = (v?: string) => (v === undefined ? undefined : v.trim() || undefined);

/** Partial update of an application's own scalar fields. Omitted fields are untouched. */
export async function updateApplicationFields(applicationId: string, input: ApplicationFieldsInput) {
  const user = await requireUser();
  const app = await prisma.application.findFirst({
    where: { id: applicationId, userId: user.id },
    select: { id: true },
  });
  if (!app) return;

  await prisma.application.update({
    where: { id: app.id },
    data: {
      company: keepIfNonEmpty(input.company),
      title: keepIfNonEmpty(input.title),
      salary: trimOrNull(input.salary),
      location: trimOrNull(input.location),
      url: trimOrNull(input.url),
      source: trimOrNull(input.source),
      contact: trimOrNull(input.contact),
      nextStep: trimOrNull(input.nextStep),
      notes: trimOrNull(input.notes),
      description: trimOrNull(input.description),
      appliedAt: input.appliedAt === undefined ? undefined : input.appliedAt,
      followUpDate: input.followUpDate === undefined ? undefined : input.followUpDate,
    },
  });

  revalidatePath("/applications");
}

/** Bulk status change; records an event per changed application. */
export async function bulkUpdateStatus(ids: string[], status: Status) {
  if (ids.length === 0) return;
  const user = await requireUser();
  const apps = await prisma.application.findMany({
    where: { id: { in: ids }, userId: user.id },
    select: { id: true, status: true },
  });
  for (const app of apps) {
    if (app.status === status) continue;
    await prisma.application.update({
      where: { id: app.id },
      data: { status, appliedAt: status === "applied" ? new Date() : undefined },
    });
    await recordApplicationEvent({
      applicationId: app.id, userId: user.id, type: "status_change",
      fromStatus: app.status, toStatus: status,
    });
  }
  revalidatePath("/applications");
}

/** Bulk mark-applied; stamps the date and records events. */
export async function bulkMarkApplied(ids: string[]) {
  if (ids.length === 0) return;
  const user = await requireUser();
  const apps = await prisma.application.findMany({
    where: { id: { in: ids }, userId: user.id },
    select: { id: true, status: true },
  });
  const now = new Date();
  for (const app of apps) {
    await prisma.application.update({
      where: { id: app.id },
      data: { status: "applied", appliedAt: now },
    });
    if (app.status !== "applied") {
      await recordApplicationEvent({
        applicationId: app.id, userId: user.id, type: "status_change",
        fromStatus: app.status, toStatus: "applied",
      });
    }
  }
  revalidatePath("/applications");
}

/** Bulk delete, scoped to the user. */
export async function bulkDelete(ids: string[]) {
  if (ids.length === 0) return;
  const user = await requireUser();
  await prisma.application.deleteMany({ where: { id: { in: ids }, userId: user.id } });
  revalidatePath("/applications");
}

/** Persist the user's column visibility/order preferences. */
export async function saveColumnPrefs(prefs: { order?: string[]; hidden?: string[] }) {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { applicationTablePrefs: prefs },
  });
  revalidatePath("/applications");
}
```

- [ ] **Step 4: Update the detail-panel caller**

In `src/components/application-detail-panel.tsx`, change the import `updateApplicationDetails` → `updateApplicationFields` and the call site accordingly (the payload shape is compatible — it already passes `{ notes, appliedAt, salary, location, url, description }`, all valid `ApplicationFieldsInput` keys). If the panel also surfaces the new fields, that's Task 12's optional polish — not required here.

- [ ] **Step 5: Run tests + typecheck the touched files**

Run: `npx vitest run src/lib/applications/actions.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit 2>&1 | grep -E "actions.ts|application-detail-panel" | head`
Expected: no output (those files are clean).

- [ ] **Step 6: Commit**

```bash
git add src/lib/applications/actions.ts src/lib/applications/actions.test.ts src/components/application-detail-panel.tsx
git commit -m "feat(applications): field-edit + bulk + column-prefs server actions"
```

---

### Task 5: Grid-navigation reducer

**Files:**
- Create: `src/lib/applications/grid-nav.ts`
- Test: `src/lib/applications/grid-nav.test.ts`

**Interfaces:**
- Produces:
  - `interface GridPos { r: number; c: number }`
  - `interface GridState { active: GridPos | null; editing: boolean }`
  - `type GridAction = { type: "activate"; r: number; c: number } | { type: "move"; dr: number; dc: number; rows: number; cols: number } | { type: "tab"; dir: 1 | -1; rows: number; cols: number } | { type: "beginEdit" } | { type: "cancelEdit" } | { type: "commitMoveDown"; rows: number }`
  - `const INITIAL_GRID: GridState`
  - `function reduceGrid(state: GridState, action: GridAction): GridState`

- [ ] **Step 1: Write failing tests**

Create `src/lib/applications/grid-nav.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { reduceGrid, INITIAL_GRID, type GridState } from "./grid-nav";

const at = (r: number, c: number, editing = false): GridState => ({ active: { r, c }, editing });

describe("reduceGrid", () => {
  it("activates a cell (not editing)", () => {
    expect(reduceGrid(INITIAL_GRID, { type: "activate", r: 2, c: 1 })).toEqual(at(2, 1));
  });

  it("moves and clamps to grid bounds", () => {
    expect(reduceGrid(at(0, 0), { type: "move", dr: -1, dc: -1, rows: 3, cols: 3 })).toEqual(at(0, 0));
    expect(reduceGrid(at(1, 1), { type: "move", dr: 1, dc: 1, rows: 3, cols: 3 })).toEqual(at(2, 2));
    expect(reduceGrid(at(2, 2), { type: "move", dr: 1, dc: 1, rows: 3, cols: 3 })).toEqual(at(2, 2));
  });

  it("move from null activates 0,0", () => {
    expect(reduceGrid(INITIAL_GRID, { type: "move", dr: 1, dc: 0, rows: 3, cols: 3 })).toEqual(at(0, 0));
  });

  it("tab advances horizontally and wraps to the next row", () => {
    expect(reduceGrid(at(0, 2), { type: "tab", dir: 1, rows: 3, cols: 3 })).toEqual(at(1, 0));
    expect(reduceGrid(at(1, 0), { type: "tab", dir: -1, rows: 3, cols: 3 })).toEqual(at(0, 2));
    expect(reduceGrid(at(2, 2), { type: "tab", dir: 1, rows: 3, cols: 3 })).toEqual(at(2, 2)); // clamp at end
  });

  it("begin/cancel edit toggles the editing flag", () => {
    expect(reduceGrid(at(1, 1), { type: "beginEdit" })).toEqual(at(1, 1, true));
    expect(reduceGrid(at(1, 1, true), { type: "cancelEdit" })).toEqual(at(1, 1, false));
  });

  it("commitMoveDown clears editing and moves down one (clamped)", () => {
    expect(reduceGrid(at(0, 1, true), { type: "commitMoveDown", rows: 3 })).toEqual(at(1, 1, false));
    expect(reduceGrid(at(2, 1, true), { type: "commitMoveDown", rows: 3 })).toEqual(at(2, 1, false));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/applications/grid-nav.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `grid-nav.ts`**

```ts
export interface GridPos { r: number; c: number }
export interface GridState { active: GridPos | null; editing: boolean }

export type GridAction =
  | { type: "activate"; r: number; c: number }
  | { type: "move"; dr: number; dc: number; rows: number; cols: number }
  | { type: "tab"; dir: 1 | -1; rows: number; cols: number }
  | { type: "beginEdit" }
  | { type: "cancelEdit" }
  | { type: "commitMoveDown"; rows: number };

export const INITIAL_GRID: GridState = { active: null, editing: false };

const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max - 1));

export function reduceGrid(state: GridState, action: GridAction): GridState {
  switch (action.type) {
    case "activate":
      return { active: { r: action.r, c: action.c }, editing: false };
    case "move": {
      const cur = state.active ?? { r: 0, c: 0 };
      if (!state.active) return { active: { r: 0, c: 0 }, editing: false };
      return {
        active: { r: clamp(cur.r + action.dr, action.rows), c: clamp(cur.c + action.dc, action.cols) },
        editing: false,
      };
    }
    case "tab": {
      const cur = state.active ?? { r: 0, c: 0 };
      let r = cur.r;
      let c = cur.c + action.dir;
      if (c >= action.cols) { c = 0; r = clamp(r + 1, action.rows); if (r === cur.r) c = action.cols - 1; }
      else if (c < 0) { c = action.cols - 1; r = clamp(r - 1, action.rows); if (r === cur.r) c = 0; }
      return { active: { r, c }, editing: false };
    }
    case "beginEdit":
      return state.active ? { ...state, editing: true } : state;
    case "cancelEdit":
      return { ...state, editing: false };
    case "commitMoveDown": {
      const cur = state.active ?? { r: 0, c: 0 };
      return { active: { r: clamp(cur.r + 1, action.rows), c: cur.c }, editing: false };
    }
    default:
      return state;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/applications/grid-nav.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/applications/grid-nav.ts src/lib/applications/grid-nav.test.ts
git commit -m "feat(applications): grid-navigation reducer"
```

---

### Task 6: Range-selection helper

**Files:**
- Create: `src/lib/applications/selection.ts`
- Test: `src/lib/applications/selection.test.ts`

**Interfaces:**
- Produces: `function rangeIds(rowIds: string[], anchorId: string, targetId: string): string[]`

- [ ] **Step 1: Write failing test**

Create `src/lib/applications/selection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rangeIds } from "./selection";

describe("rangeIds", () => {
  const rows = ["a", "b", "c", "d", "e"];
  it("returns the inclusive range regardless of direction", () => {
    expect(rangeIds(rows, "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeIds(rows, "d", "b")).toEqual(["b", "c", "d"]);
  });
  it("returns the single target when anchor is missing", () => {
    expect(rangeIds(rows, "zzz", "c")).toEqual(["c"]);
  });
  it("returns a single-element range when anchor === target", () => {
    expect(rangeIds(rows, "c", "c")).toEqual(["c"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/applications/selection.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `selection.ts`**

```ts
/** Inclusive id range between anchor and target within the given row order. */
export function rangeIds(rowIds: string[], anchorId: string, targetId: string): string[] {
  const a = rowIds.indexOf(anchorId);
  const b = rowIds.indexOf(targetId);
  if (a === -1 || b === -1) return [targetId];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return rowIds.slice(lo, hi + 1);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/applications/selection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/applications/selection.ts src/lib/applications/selection.test.ts
git commit -m "feat(applications): shift-click range selection helper"
```

---

### Task 7: SpreadsheetCell component

**Files:**
- Create: `src/components/spreadsheet/spreadsheet-cell.tsx`
- Test: `src/components/spreadsheet/spreadsheet-cell.test.tsx`

**Interfaces:**
- Consumes: `ColumnDef` (Task 2), `ApplicationRow`, `StatusPill`, `CompanyLogo`.
- Produces:
  ```ts
  interface SpreadsheetCellProps {
    app: ApplicationRow;
    column: ColumnDef;
    isActive: boolean;
    isEditing: boolean;
    onActivate: () => void;        // single click
    onBeginEdit: (seed?: string) => void; // double-click / Enter / type
    onCommit: (value: string) => void;    // text/date commit (raw string)
    onCancel: () => void;
    onStatusChange: (next: KanbanStatus) => void;
  }
  ```

**Notes:** display value formatting: dates → `toLocaleDateString(undefined,{month:"short",day:"numeric"})` (or `—`); `followUpDate` in the past → red text; `lastActivity` → existing relative formatter (import or duplicate a small `relative()`); `company` renders `<CompanyLogo>` + text. Edit mode renders `<input type="text">` or `<input type="date">` seeded with the current value, auto-focused, committing on Enter/blur and cancelling on Esc. Status cell renders `StatusPill` (its own menu handles change) — status is not "edited" via the text path.

- [ ] **Step 1: Write a focused component test**

Create `src/components/spreadsheet/spreadsheet-cell.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SpreadsheetCell } from "./spreadsheet-cell";
import { CATALOG } from "@/lib/applications/columns";
import type { ApplicationRow } from "@/app/(app)/applications/page";

const app = { id: "a1", company: "Stripe", title: "SWE", salary: "$180k", status: "applied",
  appliedAt: null, followUpDate: null, source: null, contact: null, nextStep: null,
  location: null, url: null, notes: null, description: null,
  userId: "u", createdAt: new Date(), updatedAt: new Date() } as ApplicationRow;
const salaryCol = CATALOG.find((c) => c.id === "salary")!;

const noop = () => {};

it("shows the value in display mode and commits an edited value", () => {
  const onCommit = vi.fn();
  const { rerender } = render(
    <table><tbody><tr>
      <SpreadsheetCell app={app} column={salaryCol} isActive isEditing={false}
        onActivate={noop} onBeginEdit={noop} onCommit={onCommit} onCancel={noop} onStatusChange={noop} />
    </tr></tbody></table>
  );
  expect(screen.getByText("$180k")).toBeInTheDocument();

  rerender(
    <table><tbody><tr>
      <SpreadsheetCell app={app} column={salaryCol} isActive isEditing={true}
        onActivate={noop} onBeginEdit={noop} onCommit={onCommit} onCancel={noop} onStatusChange={noop} />
    </tr></tbody></table>
  );
  const input = screen.getByRole("textbox") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "$200k" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onCommit).toHaveBeenCalledWith("$200k");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/spreadsheet/spreadsheet-cell.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `spreadsheet-cell.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { ColumnDef } from "@/lib/applications/columns";
import type { ApplicationRow } from "@/app/(app)/applications/page";
import type { KanbanStatus } from "@/lib/applications/kanban";
import { StatusPill } from "@/components/status-pill";
import { CompanyLogo } from "@/components/company-logo";
import { cn } from "@/lib/utils";

interface SpreadsheetCellProps {
  app: ApplicationRow;
  column: ColumnDef;
  isActive: boolean;
  isEditing: boolean;
  seed?: string;
  onActivate: () => void;
  onBeginEdit: (seed?: string) => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
  onStatusChange: (next: KanbanStatus) => void;
}

function relative(date: Date): string {
  const days = Math.round((Date.now() - new Date(date).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function toDateInput(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}
function fmtDate(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
}

function rawValue(app: ApplicationRow, column: ColumnDef): string {
  if (!column.field) return "";
  const v = app[column.field];
  if (v == null) return "";
  if (v instanceof Date) return toDateInput(v);
  return String(v);
}

export function SpreadsheetCell(props: SpreadsheetCellProps) {
  const { app, column, isActive, isEditing } = props;
  const cellRef = useRef<HTMLTableCellElement>(null);

  const cls = cn(
    "px-3 py-2 text-sm align-middle outline-none",
    isActive && "ring-2 ring-inset ring-ring bg-muted/20"
  );

  // Status cell: pill owns its own change menu; not text-edited.
  if (column.kind === "status") {
    return (
      <td ref={cellRef} className={cls} onClick={props.onActivate}>
        <div onClick={(e) => e.stopPropagation()}>
          <StatusPill status={app.status as KanbanStatus} onChange={props.onStatusChange} />
        </div>
      </td>
    );
  }

  if (column.kind === "lastActivity") {
    return (
      <td ref={cellRef} className={cn(cls, "text-xs text-muted-foreground")} onClick={props.onActivate}>
        {relative(app.updatedAt)}
      </td>
    );
  }

  if (isEditing && column.editable) {
    return (
      <td ref={cellRef} className={cls}>
        <CellInput
          kind={column.kind}
          initial={props.seed ?? rawValue(app, column)}
          onCommit={props.onCommit}
          onCancel={props.onCancel}
        />
      </td>
    );
  }

  // Display mode
  let content: React.ReactNode;
  if (column.kind === "company") {
    content = (
      <div className="flex items-center gap-2">
        <CompanyLogo company={app.company} size={28} />
        <span className="font-semibold">{app.company || "—"}</span>
      </div>
    );
  } else if (column.kind === "role") {
    content = <span>{app.title || "—"}</span>;
  } else if (column.kind === "date") {
    const d = (column.field ? (app[column.field] as Date | null) : null) ?? null;
    const overdue = column.id === "followUpDate" && d && new Date(d).getTime() < Date.now();
    content = <span className={cn(overdue && "text-destructive font-medium")}>{fmtDate(d)}</span>;
  } else {
    const raw = rawValue(app, column);
    content = <span className={cn(!raw && "text-muted-foreground")}>{raw || "—"}</span>;
  }

  return (
    <td
      ref={cellRef}
      className={cn(cls, "cursor-text")}
      onClick={props.onActivate}
      onDoubleClick={() => column.editable && props.onBeginEdit()}
    >
      {content}
    </td>
  );
}

function CellInput({
  kind, initial, onCommit, onCancel,
}: { kind: ColumnDef["kind"]; initial: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input
      ref={ref}
      type={kind === "date" ? "date" : "text"}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); onCommit(value); }
        else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      }}
      className="h-7 w-full rounded border border-input bg-background px-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
    />
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/spreadsheet/spreadsheet-cell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/spreadsheet/spreadsheet-cell.tsx src/components/spreadsheet/spreadsheet-cell.test.tsx
git commit -m "feat(spreadsheet): editable cell (display/edit per column kind)"
```

---

### Task 8: SpreadsheetRow component

**Files:**
- Create: `src/components/spreadsheet/spreadsheet-row.tsx`

**Interfaces:**
- Consumes: `SpreadsheetCell` (Task 7), `ColumnDef`, `ApplicationRow`, the ui `checkbox`.
- Produces:
  ```ts
  interface SpreadsheetRowProps {
    app: ApplicationRow;
    rowIndex: number;
    columns: ColumnDef[];
    selected: boolean;
    active: { r: number; c: number } | null;
    editing: boolean;
    seed?: string;
    onSelectChange: (e: React.MouseEvent) => void; // click (may be shift)
    onActivateCell: (c: number) => void;
    onBeginEditCell: (c: number, seed?: string) => void;
    onCommitCell: (c: number, value: string) => void;
    onCancelEdit: () => void;
    onStatusChange: (next: KanbanStatus) => void;
    onExpand: () => void;
  }
  ```

- [ ] **Step 1: Implement `spreadsheet-row.tsx`**

```tsx
"use client";

import type { ColumnDef } from "@/lib/applications/columns";
import type { ApplicationRow } from "@/app/(app)/applications/page";
import type { KanbanStatus } from "@/lib/applications/kanban";
import { SpreadsheetCell } from "./spreadsheet-cell";
import { Checkbox } from "@/components/ui/checkbox";
import { Maximize2 } from "lucide-react";

interface SpreadsheetRowProps {
  app: ApplicationRow;
  rowIndex: number;
  columns: ColumnDef[];
  selected: boolean;
  active: { r: number; c: number } | null;
  editing: boolean;
  seed?: string;
  onSelectChange: (e: React.MouseEvent) => void;
  onActivateCell: (c: number) => void;
  onBeginEditCell: (c: number, seed?: string) => void;
  onCommitCell: (c: number, value: string) => void;
  onCancelEdit: () => void;
  onStatusChange: (next: KanbanStatus) => void;
  onExpand: () => void;
}

export function SpreadsheetRow(props: SpreadsheetRowProps) {
  const { app, rowIndex, columns, active } = props;
  const activeCol = active?.r === rowIndex ? active.c : -1;

  return (
    <tr className="border-t border-border/60 hover:bg-muted/20">
      <td className="w-9 px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
        <span onClick={props.onSelectChange} className="inline-flex cursor-pointer">
          <Checkbox checked={props.selected} aria-label={`Select ${app.company}`} />
        </span>
      </td>
      {columns.map((column, c) => (
        <SpreadsheetCell
          key={column.id}
          app={app}
          column={column}
          isActive={activeCol === c}
          isEditing={activeCol === c && props.editing}
          seed={activeCol === c ? props.seed : undefined}
          onActivate={() => props.onActivateCell(c)}
          onBeginEdit={(seed) => props.onBeginEditCell(c, seed)}
          onCommit={(v) => props.onCommitCell(c, v)}
          onCancel={props.onCancelEdit}
          onStatusChange={props.onStatusChange}
        />
      ))}
      <td className="w-9 px-2 py-2 text-center">
        <button aria-label="Open details" onClick={props.onExpand} className="text-muted-foreground hover:text-foreground">
          <Maximize2 className="size-4" />
        </button>
      </td>
    </tr>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep spreadsheet-row`
Expected: no output. (No standalone test — exercised via Task 11's component tests.)

- [ ] **Step 3: Commit**

```bash
git add src/components/spreadsheet/spreadsheet-row.tsx
git commit -m "feat(spreadsheet): row with checkbox, cells, expand"
```

---

### Task 9: Column menu (show/hide + reorder)

**Files:**
- Create: `src/components/spreadsheet/column-menu.tsx`

**Interfaces:**
- Consumes: `CATALOG`, `ColumnDef`, `ColumnId`, `TablePrefs`, `saveColumnPrefs`, `@dnd-kit/*`, ui `menu`/`checkbox`.
- Produces:
  ```ts
  interface ColumnMenuProps {
    columns: ColumnDef[];              // current visible, in order
    onChange: (next: { order: ColumnId[]; hidden: ColumnId[] }) => void; // optimistic apply + persist upstream
  }
  ```

**Notes:** Render a popover (reuse `Menu`/`MenuContent`) listing ALL catalog columns. Each row: a checkbox (visible = in `columns`) + a drag handle. Toggling recomputes `{order, hidden}` and calls `onChange`. Reorder uses `@dnd-kit` `SortableContext` over the visible columns (mirror the dnd-kit usage already present in the repo — check `application-kanban.tsx` before it's deleted for the import pattern, or `@dnd-kit/sortable` docs). Persistence (`saveColumnPrefs`) is called by the parent in `onChange` — keep this component controlled.

- [ ] **Step 1: Implement `column-menu.tsx`**

Provide a working control. Minimum viable, fully-typed implementation:

```tsx
"use client";

import { CATALOG, type ColumnDef, type ColumnId } from "@/lib/applications/columns";
import { Menu, MenuTrigger, MenuContent } from "@/components/ui/menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal, GripVertical } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ColumnMenuProps {
  columns: ColumnDef[];
  onChange: (next: { order: ColumnId[]; hidden: ColumnId[] }) => void;
}

export function ColumnMenu({ columns, onChange }: ColumnMenuProps) {
  const visibleIds = columns.map((c) => c.id);
  const orderedCatalog: ColumnDef[] = [
    ...columns,
    ...CATALOG.filter((c) => !visibleIds.includes(c.id)),
  ];
  const sensors = useSensors(useSensor(PointerSensor));

  function emit(order: ColumnId[], hidden: ColumnId[]) {
    onChange({ order, hidden });
  }

  function toggle(id: ColumnId, show: boolean) {
    const hiddenNow = CATALOG.map((c) => c.id).filter((cid) => !visibleIds.includes(cid));
    if (show) {
      emit([...visibleIds, id], hiddenNow.filter((h) => h !== id));
    } else {
      emit(visibleIds.filter((v) => v !== id), [...hiddenNow, id]);
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = visibleIds.indexOf(active.id as ColumnId);
    const to = visibleIds.indexOf(over.id as ColumnId);
    if (from === -1 || to === -1) return;
    const nextOrder = arrayMove(visibleIds, from, to);
    const hiddenNow = CATALOG.map((c) => c.id).filter((cid) => !visibleIds.includes(cid));
    emit(nextOrder, hiddenNow);
  }

  return (
    <Menu>
      <MenuTrigger render={<Button variant="secondary" size="sm"><SlidersHorizontal className="size-4" /> Columns</Button>} />
      <MenuContent className="min-w-56 p-1">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
            {orderedCatalog.map((col) => {
              const visible = visibleIds.includes(col.id);
              return (
                <ColumnRow key={col.id} col={col} visible={visible} onToggle={(show) => toggle(col.id, show)} />
              );
            })}
          </SortableContext>
        </DndContext>
      </MenuContent>
    </Menu>
  );
}

function ColumnRow({ col, visible, onToggle }: { col: ColumnDef; visible: boolean; onToggle: (show: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: col.id, disabled: !visible });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50">
      <span onClick={() => onToggle(!visible)} className="inline-flex cursor-pointer">
        <Checkbox checked={visible} aria-label={`Toggle ${col.label}`} />
      </span>
      <span className="flex-1">{col.label}</span>
      {visible && (
        <button {...attributes} {...listeners} aria-label={`Reorder ${col.label}`} className="cursor-grab text-muted-foreground">
          <GripVertical className="size-4" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep column-menu`
Expected: no output. (If `@dnd-kit/sortable` exports differ, consult `node_modules/@dnd-kit/sortable` types and adjust imports.)

- [ ] **Step 3: Commit**

```bash
git add src/components/spreadsheet/column-menu.tsx
git commit -m "feat(spreadsheet): column show/hide + drag-reorder menu"
```

---

### Task 10: Bulk action bar

**Files:**
- Create: `src/components/spreadsheet/bulk-action-bar.tsx`

**Interfaces:**
- Produces:
  ```ts
  interface BulkActionBarProps {
    count: number;
    onSetStatus: (status: KanbanStatus) => void;
    onMarkApplied: () => void;
    onDelete: () => void;
    onClear: () => void;
  }
  ```

- [ ] **Step 1: Implement `bulk-action-bar.tsx`**

```tsx
"use client";

import { KANBAN_COLUMNS, type KanbanStatus } from "@/lib/applications/kanban";
import { STATUS_DOT } from "@/components/status-pill";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { CalendarCheck, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface BulkActionBarProps {
  count: number;
  onSetStatus: (status: KanbanStatus) => void;
  onMarkApplied: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkActionBar({ count, onSetStatus, onMarkApplied, onDelete, onClear }: BulkActionBarProps) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
      <span className="font-semibold">{count} selected</span>
      <div className="ml-auto flex items-center gap-2">
        <Menu>
          <MenuTrigger render={<Button variant="secondary" size="sm">Set status ▾</Button>} />
          <MenuContent>
            {KANBAN_COLUMNS.map(({ status, label }) => (
              <MenuItem key={status} onClick={() => onSetStatus(status)}>
                <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} />
                {label}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
        <Button variant="secondary" size="sm" onClick={onMarkApplied}>
          <CalendarCheck className="size-4" /> Mark applied
        </Button>
        <Button variant="secondary" size="sm" onClick={onDelete}
          className="text-destructive hover:bg-destructive/10">
          <Trash2 className="size-4" /> Delete
        </Button>
        <button aria-label="Clear selection" onClick={onClear} className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep bulk-action-bar`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/spreadsheet/bulk-action-bar.tsx
git commit -m "feat(spreadsheet): bulk action bar"
```

---

### Task 11: ApplicationSpreadsheet — top-level orchestrator

**Files:**
- Create: `src/components/spreadsheet/application-spreadsheet.tsx`
- Test: `src/components/spreadsheet/application-spreadsheet.test.tsx`

**Interfaces:**
- Consumes: everything above + `filterApplications`/`sortApplications`/`summarize`/`nextSort` (table.ts), `ApplicationStatTiles`, `ApplicationDetailPanel`, `EmptyState`, `AddJobDialog`, actions (`updateStatus`, `markAppliedToday`, `updateApplicationFields`, `bulkUpdateStatus`, `bulkMarkApplied`, `bulkDelete`, `saveColumnPrefs`).
- Produces:
  ```ts
  export function ApplicationSpreadsheet({ applications, prefs }: { applications: ApplicationRow[]; prefs: TablePrefs | null }): JSX.Element
  ```

**Behavior contract (what the tests verify):**
- Renders stat tiles, toolbar (search + filter chips + Columns menu), and a grid with header + one row per filtered/sorted app.
- Clicking a text cell activates it; pressing Enter enters edit; changing the input + Enter commits → optimistic patch + `updateApplicationFields(id, { [field]: value })` called; blur commits too.
- Date cells commit an ISO `yyyy-mm-dd` string → converted to a `Date` (or `null` when cleared) in the payload.
- Arrow keys move the active cell (via `reduceGrid`); Esc cancels an edit.
- Checkbox selects a row; shift-click selects a range (`rangeIds`); bulk bar appears and its actions call the bulk actions for the selected ids and clear the selection.
- Column menu `onChange` applies new columns locally (optimistic) and calls `saveColumnPrefs`.
- Failed field commit reverts that row and shows the error banner.

**Implementation guidance:** hold state: `apps` (optimistic copy, synced from props via the existing `pendingRef` pattern from `applications-table.tsx`), `search`, `filter`, `sort`, `dir`, `columns` (from `resolveColumns(prefs)` kept in state so the menu can update it), `selection: Set<string>`, `selectionAnchor: string | null`, grid state via `useReducer(reduceGrid, INITIAL_GRID)`, `editSeed: string | undefined`, `error`. Compute `rows = sortApplications(filterApplications(apps, {search, filter}), sort, dir)`. Wrap the whole grid in a `keydown` handler that translates arrows/Tab/Enter/Escape/printable-char into `reduceGrid` dispatches (respecting `column.editable`). On commit, map `column.field` → the correct action: `status` uses `updateStatus`; date fields parse the ISO string to `Date|null`; everything else passes the string through `updateApplicationFields`. Reuse the exact optimistic+revert+`pendingRef` machinery from the existing `applications-table.tsx` (read it first).

Provide the full file. It is large but mechanical; below is the complete implementation.

```tsx
"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Search } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/empty-state";
import { ApplicationStatTiles } from "@/components/application-stat-tiles";
import { AddJobDialog } from "@/components/add-job-dialog";
import { ApplicationDetailPanel } from "@/components/application-detail-panel";
import { SpreadsheetRow } from "./spreadsheet-row";
import { ColumnMenu } from "./column-menu";
import { BulkActionBar } from "./bulk-action-bar";
import {
  filterApplications, sortApplications, summarize, nextSort,
  type TableFilter, type TableSort, type SortDir,
} from "@/lib/applications/table";
import { resolveColumns, type ColumnDef, type ColumnId, type TablePrefs } from "@/lib/applications/columns";
import { reduceGrid, INITIAL_GRID } from "@/lib/applications/grid-nav";
import { rangeIds } from "@/lib/applications/selection";
import {
  updateStatus, markAppliedToday, updateApplicationFields,
  bulkUpdateStatus, bulkMarkApplied, bulkDelete, saveColumnPrefs,
} from "@/lib/applications/actions";
import type { KanbanStatus } from "@/lib/applications/kanban";
import type { ApplicationRow } from "@/app/(app)/applications/page";
import { cn } from "@/lib/utils";

const FILTERS: { key: TableFilter; label: string }[] = [
  { key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "saved", label: "Saved" },
];

// Map a column id to the TableSort key (only sortable columns).
const SORT_KEY: Partial<Record<ColumnId, TableSort>> = {
  company: "company", status: "status", appliedAt: "applied", followUpDate: "followUpDate",
  salary: "salary", source: "source", contact: "contact", nextStep: "nextStep", lastActivity: "lastActivity",
};

function parseDate(iso: string): Date | null {
  if (!iso.trim()) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export function ApplicationSpreadsheet({
  applications, prefs,
}: { applications: ApplicationRow[]; prefs: TablePrefs | null }) {
  const [apps, setApps] = useState(applications);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TableFilter>("all");
  const [sort, setSort] = useState<TableSort>("lastActivity");
  const [dir, setDir] = useState<SortDir>("desc");
  const [columns, setColumns] = useState<ColumnDef[]>(() => resolveColumns(prefs));
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [grid, dispatch] = useReducer(reduceGrid, INITIAL_GRID);
  const [seed, setSeed] = useState<string | undefined>(undefined);
  const [detail, setDetail] = useState<ApplicationRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(0);

  useEffect(() => { if (pendingRef.current === 0) setApps(applications); }, [applications]);

  const rows = useMemo(
    () => sortApplications(filterApplications(apps, { search, filter }), sort, dir),
    [apps, search, filter, sort, dir]
  );
  const summary = useMemo(() => summarize(apps), [apps]);
  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);

  // ---- optimistic field commit ----
  function runOptimistic(appId: string, patch: Partial<ApplicationRow>, action: () => Promise<void>, revert: Partial<ApplicationRow>) {
    setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, ...patch } : a)));
    setError(null);
    pendingRef.current++;
    action().catch(() => {
      setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, ...revert } : a)));
      setError("Update failed. Please try again.");
    }).finally(() => { pendingRef.current--; });
  }

  function commitCell(app: ApplicationRow, column: ColumnDef, value: string) {
    if (!column.field || !column.editable) return;
    const field = column.field;
    if (column.kind === "date") {
      const parsed = parseDate(value);
      const prev = app[field] as Date | null;
      runOptimistic(app.id, { [field]: parsed } as Partial<ApplicationRow>,
        () => updateApplicationFields(app.id, { [field]: parsed } as never),
        { [field]: prev } as Partial<ApplicationRow>);
    } else {
      const next = value.trim() || null;
      const prev = app[field] as string | null;
      // company/title must not be blanked
      if ((field === "company" || field === "title") && !next) return;
      runOptimistic(app.id, { [field]: next } as Partial<ApplicationRow>,
        () => updateApplicationFields(app.id, { [field]: value } as never),
        { [field]: prev } as Partial<ApplicationRow>);
    }
  }

  function handleStatus(app: ApplicationRow, next: KanbanStatus) {
    if (app.status === next) return;
    const prevStatus = app.status;
    const prevApplied = app.appliedAt;
    const optimisticApplied = next === "applied" ? new Date() : app.appliedAt;
    runOptimistic(app.id, { status: next, appliedAt: optimisticApplied },
      () => updateStatus(app.id, next), { status: prevStatus, appliedAt: prevApplied });
  }

  // ---- selection ----
  function toggleRow(app: ApplicationRow, e: React.MouseEvent) {
    e.preventDefault();
    setSelection((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && anchor) {
        for (const id of rangeIds(rowIds, anchor, app.id)) next.add(id);
      } else {
        if (next.has(app.id)) next.delete(app.id); else next.add(app.id);
        setAnchor(app.id);
      }
      return next;
    });
  }
  const allSelected = rows.length > 0 && rows.every((r) => selection.has(r.id));
  function toggleAll() {
    setSelection(allSelected ? new Set() : new Set(rowIds));
  }
  function clearSelection() { setSelection(new Set()); }

  // ---- bulk ----
  function bulk(action: (ids: string[]) => Promise<void>, optimistic?: (id: string) => Partial<ApplicationRow>) {
    const ids = [...selection];
    if (ids.length === 0) return;
    if (optimistic) setApps((prev) => prev.map((a) => (selection.has(a.id) ? { ...a, ...optimistic(a.id) } : a)));
    setError(null);
    pendingRef.current++;
    action(ids).catch(() => setError("Bulk action failed. Refresh to re-sync.")).finally(() => { pendingRef.current--; });
    clearSelection();
  }

  // ---- columns ----
  function applyColumns(next: { order: ColumnId[]; hidden: ColumnId[] }) {
    setColumns(resolveColumns(next));
    saveColumnPrefs(next).catch(() => setError("Could not save column layout."));
  }

  // ---- keyboard ----
  function onGridKeyDown(e: React.KeyboardEvent) {
    const cols = columns.length;
    const rowsN = rows.length;
    if (!grid.active) return;
    const col = columns[grid.active.c];
    if (grid.editing) {
      // input handles its own keys; only intercept nothing here
      return;
    }
    if (e.key === "ArrowUp") { e.preventDefault(); dispatch({ type: "move", dr: -1, dc: 0, rows: rowsN, cols }); }
    else if (e.key === "ArrowDown") { e.preventDefault(); dispatch({ type: "move", dr: 1, dc: 0, rows: rowsN, cols }); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); dispatch({ type: "move", dr: 0, dc: -1, rows: rowsN, cols }); }
    else if (e.key === "ArrowRight") { e.preventDefault(); dispatch({ type: "move", dr: 0, dc: 1, rows: rowsN, cols }); }
    else if (e.key === "Tab") { e.preventDefault(); dispatch({ type: "tab", dir: e.shiftKey ? -1 : 1, rows: rowsN, cols }); }
    else if (e.key === "Enter") { if (col?.editable) { e.preventDefault(); setSeed(undefined); dispatch({ type: "beginEdit" }); } }
    else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && col?.editable && col.kind !== "date" && col.kind !== "status") {
      e.preventDefault(); setSeed(e.key); dispatch({ type: "beginEdit" });
    }
  }

  function onCommitCell(rowIndex: number, c: number, value: string) {
    const app = rows[rowIndex];
    const column = columns[c];
    if (app && column) commitCell(app, column, value);
    dispatch({ type: "commitMoveDown", rows: rows.length });
  }

  function openDetail(app: ApplicationRow) { setDetail(app); setDetailOpen(true); }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-5" onKeyDown={onGridKeyDown}>
        <ApplicationStatTiles summary={summary} />

        {error && (
          <div role="alert" aria-live="assertive" className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss error" className="ml-auto">×</button>
          </div>
        )}

        {apps.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3">
              <Search className="size-4 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company or role…"
                aria-label="Search applications" className="h-9 flex-1 bg-transparent text-sm outline-none" />
            </div>
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
                className={cn("rounded-lg border px-3 py-2 text-xs font-semibold transition",
                  filter === f.key ? "border-primary/30 bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted")}>
                {f.label}
              </button>
            ))}
            <ColumnMenu columns={columns} onChange={applyColumns} />
          </div>
        )}

        {selection.size > 0 && (
          <BulkActionBar
            count={selection.size}
            onSetStatus={(s) => bulk((ids) => bulkUpdateStatus(ids, s), () => ({ status: s }))}
            onMarkApplied={() => bulk((ids) => bulkMarkApplied(ids), () => ({ status: "applied", appliedAt: new Date() }))}
            onDelete={() => { const ids = new Set(selection); setApps((prev) => prev.filter((a) => !ids.has(a.id))); bulk((i) => bulkDelete(i)); }}
            onClear={clearSelection}
          />
        )}

        {apps.length === 0 ? (
          <EmptyState title="No applications yet"
            message="Track a role you applied to anywhere — it doesn't have to come from this app."
            action={<AddJobDialog />} />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <th className="w-9 px-2 py-3 text-center">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                  </th>
                  {columns.map((col) => {
                    const key = SORT_KEY[col.id];
                    return (
                      <th key={col.id} className="px-3 py-3">
                        {col.sortable && key ? (
                          <button type="button" onClick={() => { const n = nextSort(sort, dir, key); setSort(n.key); setDir(n.dir); }}
                            className="uppercase tracking-wide hover:text-foreground">
                            {col.label}{sort === key ? (dir === "asc" ? " ↑" : " ↓") : ""}
                          </button>
                        ) : col.label}
                      </th>
                    );
                  })}
                  <th className="w-9 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((app, r) => (
                  <SpreadsheetRow
                    key={app.id}
                    app={app}
                    rowIndex={r}
                    columns={columns}
                    selected={selection.has(app.id)}
                    active={grid.active}
                    editing={grid.editing}
                    seed={seed}
                    onSelectChange={(e) => toggleRow(app, e)}
                    onActivateCell={(c) => dispatch({ type: "activate", r, c })}
                    onBeginEditCell={(c, s) => { dispatch({ type: "activate", r, c }); setSeed(s); dispatch({ type: "beginEdit" }); }}
                    onCommitCell={(c, v) => onCommitCell(r, c, v)}
                    onCancelEdit={() => dispatch({ type: "cancelEdit" })}
                    onStatusChange={(s) => handleStatus(app, s)}
                    onExpand={() => openDetail(app)}
                  />
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={columns.length + 2} className="px-4 py-10 text-center text-sm text-muted-foreground">No applications match your filters.</td></tr>
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

- [ ] **Step 1: Write component tests**

Create `src/components/spreadsheet/application-spreadsheet.test.tsx`. Mock the actions module and assert behavior:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ApplicationSpreadsheet } from "./application-spreadsheet";
import type { ApplicationRow } from "@/app/(app)/applications/page";

const actions = vi.hoisted(() => ({
  updateApplicationFields: vi.fn().mockResolvedValue(undefined),
  updateStatus: vi.fn().mockResolvedValue(undefined),
  markAppliedToday: vi.fn().mockResolvedValue(undefined),
  bulkUpdateStatus: vi.fn().mockResolvedValue(undefined),
  bulkMarkApplied: vi.fn().mockResolvedValue(undefined),
  bulkDelete: vi.fn().mockResolvedValue(undefined),
  saveColumnPrefs: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/applications/actions", () => actions);

const mk = (over: Partial<ApplicationRow>): ApplicationRow => ({
  id: "a1", userId: "u", company: "Stripe", title: "SWE", url: null, location: null,
  salary: "$180k", description: null, status: "applied", notes: null, appliedAt: null,
  followUpDate: null, source: null, contact: null, nextStep: null,
  createdAt: new Date(), updatedAt: new Date(), ...over,
} as ApplicationRow);

beforeEach(() => vi.clearAllMocks());

it("commits an inline salary edit via updateApplicationFields", () => {
  render(<ApplicationSpreadsheet applications={[mk({})]} prefs={null} />);
  fireEvent.doubleClick(screen.getByText("$180k"));
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "$200k" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(actions.updateApplicationFields).toHaveBeenCalledWith("a1", { salary: "$200k" });
});

it("shift-click selects a range and bulk-deletes them", () => {
  const rows = [mk({ id: "a1", company: "A" }), mk({ id: "a2", company: "B" }), mk({ id: "a3", company: "C" })];
  render(<ApplicationSpreadsheet applications={rows} prefs={null} />);
  const checks = screen.getAllByLabelText(/Select [ABC]/);
  fireEvent.click(checks[0]);
  fireEvent.click(checks[2], { shiftKey: true });
  expect(screen.getByText("3 selected")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
  expect(actions.bulkDelete).toHaveBeenCalledWith(["a1", "a2", "a3"]);
});
```

- [ ] **Step 2: Run to verify failure, then pass**

Run: `npx vitest run src/components/spreadsheet/application-spreadsheet.test.tsx`
Expected: FAIL first (module not found), PASS after the component file is in place. Iterate on the component until both tests pass. (If the `date`/`status` cell interferes with `getByText`, target cells by their column text as needed.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep spreadsheet`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/spreadsheet/application-spreadsheet.tsx src/components/spreadsheet/application-spreadsheet.test.tsx
git commit -m "feat(spreadsheet): top-level grid orchestrator (edit, nav, select, bulk, columns)"
```

---

### Task 12: Page integration

**Files:**
- Modify: `src/app/(app)/applications/page.tsx`
- Modify: `src/app/(app)/applications/loading.tsx`

- [ ] **Step 1: Fetch prefs + render the spreadsheet**

Rewrite `src/app/(app)/applications/page.tsx`:

```tsx
import type { Application } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApplicationSpreadsheet } from "@/components/spreadsheet/application-spreadsheet";
import { AddJobDialog } from "@/components/add-job-dialog";
import { isKanbanStatus } from "@/lib/applications/kanban";
import type { TablePrefs } from "@/lib/applications/columns";

export const dynamic = "force-dynamic";

export type ApplicationRow = Application;

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  const { status } = await searchParams;
  const statusFilter = status && isKanbanStatus(status) ? status : undefined;

  const [apps, dbUser] = await Promise.all([
    prisma.application.findMany({
      where: { userId: user.id, ...(statusFilter ? { status: statusFilter } : {}) },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.user.findUnique({ where: { id: user.id }, select: { applicationTablePrefs: true } }),
  ]);
  const prefs = (dbUser?.applicationTablePrefs ?? null) as TablePrefs | null;

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Tracker</p>
          <h1 className="text-3xl font-extrabold tracking-tight">Applications</h1>
          <p className="text-muted-foreground mt-1">
            Every role you&apos;re chasing — in one place that beats a spreadsheet.
          </p>
        </div>
        <AddJobDialog />
      </div>
      <ApplicationSpreadsheet applications={apps} prefs={prefs} />
    </div>
  );
}
```

- [ ] **Step 2: Update the loading skeleton to a table shape**

Replace `src/app/(app)/applications/loading.tsx` body with a simple table skeleton (drop the "kanban columns" grid):

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function ApplicationsLoading() {
  return (
    <div aria-hidden="true">
      <Skeleton className="h-7 w-40 mb-2" />
      <Skeleton className="h-4 w-72 mb-6" />
      <div className="rounded-2xl border border-border overflow-hidden">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full border-t border-border/60" />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the page compiles + build**

Run: `npx tsc --noEmit 2>&1 | grep -E "applications/page|applications/loading"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/applications/page.tsx" "src/app/(app)/applications/loading.tsx"
git commit -m "feat(applications): render spreadsheet + fetch column prefs"
```

---

### Task 13: Cleanup + full verification

**Files:**
- Delete: `src/components/applications-table.tsx`, `src/components/applications-table.test.tsx`, `src/components/application-kanban.tsx`, `src/components/application-kanban.test.tsx` (if present)
- Modify: `src/lib/applications/kanban.ts` (prune dead helpers)
- Possibly delete: `src/components/application-card.tsx` (+ `skeleton-application-card.tsx`) if orphaned after kanban removal

- [ ] **Step 1: Confirm the old table + kanban are unreferenced**

Run:
```bash
grep -rn "applications-table\|ApplicationsTable\|application-kanban\|ApplicationKanban" src app
```
Expected: only the files being deleted reference these (the page now imports `ApplicationSpreadsheet`). If anything else references them, fix it.

- [ ] **Step 2: Delete the replaced files**

```bash
git rm src/components/applications-table.tsx src/components/applications-table.test.tsx \
  src/components/application-kanban.tsx
# delete the kanban test too if it exists:
git rm src/components/application-kanban.test.tsx 2>/dev/null || true
```

- [ ] **Step 3: Prune now-dead helpers from `kanban.ts`**

Run `grep -rn "groupByStatus\|moveApplication" src app`. If the only remaining references are the definitions in `src/lib/applications/kanban.ts` and its test, delete `groupByStatus` and `moveApplication` from `kanban.ts` and their tests from `kanban.test.ts`. Keep `KANBAN_STATUSES`, `KANBAN_COLUMNS`, `KanbanStatus`, `isKanbanStatus`.

- [ ] **Step 4: Check `application-card` / `skeleton-application-card` orphan status**

Run `grep -rn "application-card\|ApplicationCard\|skeleton-application-card\|SkeletonApplicationCard" src app`. If they are referenced only by the just-deleted kanban (and each other), `git rm` them and any test. If anything surviving uses them, leave them.

- [ ] **Step 5: Full verification**

Run and confirm each:
- `npx tsc --noEmit 2>&1 | grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\): error.*//' | sort -u` → no output.
- `npm test` → all pass except the 1 known pre-existing `resume/upload` undici failure. Report the count.
- `npm run build` → succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(applications): remove old table + dead kanban after spreadsheet migration"
```

---

## Self-Review Notes (author)

- **Spec coverage:** §1 data model → Task 1; §2 catalog/resolver → Task 2; §3 actions → Task 4; §4 interaction layer → Tasks 5 (nav), 6 (selection), 7 (cell edit), 11 (orchestration); §5 components → Tasks 7–11; §6 filter/sort → Task 3; §7 cleanup → Task 13; §8 page integration → Task 12; testing → folded per task + Task 13 gate.
- **Type consistency:** `ColumnId`/`ColumnDef`/`TablePrefs`/`resolveColumns` (Task 2) consumed identically in 3, 9, 11, 12. `reduceGrid`/`GridState`/`GridAction` (Task 5) consumed in 11. `ApplicationFieldsInput`/`updateApplicationFields`/bulk actions/`saveColumnPrefs` (Task 4) consumed in 11. `rangeIds` (Task 6) consumed in 11. `SpreadsheetCell` props (Task 7) consumed by `SpreadsheetRow` (Task 8), which is consumed by the orchestrator (Task 11).
- **Known risk:** the orchestrator's keyboard handler lives on the container `onKeyDown`; while a cell input is focused and editing, the handler early-returns (`grid.editing`) so the input owns its keys — the cell's own Enter/Esc drive commit/cancel. Verify this interplay in Task 11's iteration.
- **Open note for implementer:** confirm `@dnd-kit/sortable` and `@dnd-kit/utilities` export names against the installed version (Task 9) — adjust imports if the version differs from the snippet.
