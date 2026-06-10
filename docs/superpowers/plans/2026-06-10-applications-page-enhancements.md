# Applications Page Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clickable sortable column headers, a read-first slide-over detail drawer, and a right-click row context menu to the Applications power table.

**Architecture:** Sort/“mark applied” logic lands in pure, unit-tested functions (`lib/applications/table.ts`) and one new server action (`lib/applications/actions.ts`). The table (`applications-table.tsx`) gains sort direction state + sortable headers and wraps each row in a new `ApplicationContextMenu`. The detail modal becomes a right-side slide-over via a new dialog-based `ui/drawer.tsx`. Two thin base-ui wrappers (`ui/drawer.tsx`, `ui/context-menu.tsx`) follow the existing `ui/menu.tsx` style.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, base-ui (`@base-ui/react`), Tailwind v4 + `tw-animate-css`, Vitest, Prisma/Neon.

---

## File Structure

**Modify:**
- `src/lib/applications/table.ts` — add `SortDir`, new sort keys (`status`, `salary`), `DEFAULT_DIR`, rewrite `sortApplications(apps, key, dir)`, add `nextSort`.
- `src/lib/applications/table.test.ts` — cover new keys, directions, null handling, `nextSort`.
- `src/lib/applications/actions.ts` — add `markAppliedToday`.
- `src/components/applications-table.tsx` — sortable headers + direction; keep dropdown; new optimistic `handleMarkApplied` / `handleDelete`; wrap rows in `ApplicationContextMenu`.
- `src/components/application-detail-panel.tsx` — modal → slide-over, read-first layout with Edit toggle.

**Create:**
- `src/components/ui/drawer.tsx` — right-side sheet on base-ui `dialog`.
- `src/components/ui/context-menu.tsx` — base-ui `context-menu` wrappers.
- `src/components/application-context-menu.tsx` — the per-row menu.

---

## Task 1: Sort logic — direction + new keys (pure, TDD)

**Files:**
- Modify: `src/lib/applications/table.ts`
- Test: `src/lib/applications/table.test.ts`

- [ ] **Step 1: Read the current file**

Run: `cat src/lib/applications/table.ts`
Note the existing `TableSort = "lastActivity" | "applied" | "company"`, `sortApplications(apps, sort)`, `filterApplications`, `summarize`, and the `AppWithJob` import. Keep `filterApplications`/`summarize` untouched.

- [ ] **Step 2: Write the failing tests**

The file already has a factory `makeApp(id, status, opts)` (~line 11) and an existing `describe("sortApplications", …)` that calls `sortApplications(apps, "lastActivity" | "applied" | "company")` with the **OLD two-arg** signature (lines ~83, 92, 100, 106). Do two things:

**(a) Extend the factory** to support `salaryMin`. In `makeApp`, add `salaryMin?: number | null;` to the `opts` type, and add `salaryMin: opts.salaryMin ?? null,` to the returned `job` object.

**(b) Update the existing 2-arg calls** in the current `describe("sortApplications", …)` to pass a direction — they were relying on the previous defaults:
- `sortApplications(apps, "lastActivity")` → `sortApplications(apps, "lastActivity", "desc")`
- `sortApplications(apps, "applied")` → `sortApplications(apps, "applied", "desc")`
- `sortApplications(apps, "company")` (both the assertion and the no-mutation call) → `sortApplications(apps, "company", "asc")`

Then update the import to add the new symbols, and append the new `describe` blocks (reusing `makeApp`):

```ts
// add to the existing import from "./table":
import {
  filterApplications,
  sortApplications,
  summarize,
  nextSort,
  DEFAULT_DIR,
  type TableFilter,
  type TableSort,
} from "./table";
```

```ts
describe("sortApplications — new keys & direction", () => {
  it("sorts by company asc and desc", () => {
    const apps = [
      makeApp("1", "applied", { company: "Zeta" }),
      makeApp("2", "applied", { company: "Alpha" }),
    ];
    expect(sortApplications(apps, "company", "asc").map((a) => a.id)).toEqual(["2", "1"]);
    expect(sortApplications(apps, "company", "desc").map((a) => a.id)).toEqual(["1", "2"]);
  });

  it("sorts by status using pipeline rank", () => {
    const apps = [
      makeApp("rej", "rejected"),
      makeApp("sav", "saved"),
      makeApp("int", "interviewing"),
    ];
    expect(sortApplications(apps, "status", "asc").map((a) => a.id)).toEqual(["sav", "int", "rej"]);
    expect(sortApplications(apps, "status", "desc").map((a) => a.id)).toEqual(["rej", "int", "sav"]);
  });

  it("sorts by applied date with nulls always last, both directions", () => {
    const apps = [
      makeApp("none", "saved", { appliedAt: null }),
      makeApp("old", "applied", { appliedAt: new Date("2025-01-01") }),
      makeApp("new", "applied", { appliedAt: new Date("2025-06-01") }),
    ];
    expect(sortApplications(apps, "applied", "desc").map((a) => a.id)).toEqual(["new", "old", "none"]);
    expect(sortApplications(apps, "applied", "asc").map((a) => a.id)).toEqual(["old", "new", "none"]);
  });

  it("sorts by salary using salaryMin with nulls always last", () => {
    const apps = [
      makeApp("none", "applied", { salaryMin: null }),
      makeApp("lo", "applied", { salaryMin: 50 }),
      makeApp("hi", "applied", { salaryMin: 120 }),
    ];
    expect(sortApplications(apps, "salary", "desc").map((a) => a.id)).toEqual(["hi", "lo", "none"]);
    expect(sortApplications(apps, "salary", "asc").map((a) => a.id)).toEqual(["lo", "hi", "none"]);
  });

  it("does not mutate the input array", () => {
    const apps = [makeApp("1", "applied"), makeApp("2", "applied")];
    const ids = apps.map((a) => a.id);
    sortApplications(apps, "company", "asc");
    expect(apps.map((a) => a.id)).toEqual(ids);
  });
});

describe("nextSort", () => {
  it("flips direction when the same key is clicked", () => {
    expect(nextSort("company", "asc", "company")).toEqual({ key: "company", dir: "desc" });
    expect(nextSort("company", "desc", "company")).toEqual({ key: "company", dir: "asc" });
  });
  it("uses the key's default direction when a new key is clicked", () => {
    expect(nextSort("company", "asc", "applied")).toEqual({ key: "applied", dir: DEFAULT_DIR.applied });
    expect(nextSort("applied", "asc", "salary")).toEqual({ key: "salary", dir: DEFAULT_DIR.salary });
  });
});
```

Note: the factory's `salaryMin` requires the `as unknown as AppWithJob` cast already present — fine, since the partial `job` literal is cast. Ensure `salaryMin` is added inside that literal so the cast carries it.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test -- src/lib/applications/table.test.ts`
Expected: FAIL — `nextSort`/`DEFAULT_DIR` not exported and `sortApplications` signature mismatch.

- [ ] **Step 4: Implement the new sort logic**

Replace the `TableSort` type, the `SORTS`-adjacent logic, and `sortApplications` in `src/lib/applications/table.ts` with:

```ts
export type TableSort = "company" | "status" | "applied" | "salary" | "lastActivity";
export type SortDir = "asc" | "desc";

export const DEFAULT_DIR: Record<TableSort, SortDir> = {
  company: "asc",
  status: "asc",
  applied: "desc",
  salary: "desc",
  lastActivity: "desc",
};

const STATUS_RANK: Record<string, number> = {
  saved: 0,
  applied: 1,
  interviewing: 2,
  offer: 3,
  rejected: 4,
};

/** Decide the next {key, dir} when a column/control is chosen. */
export function nextSort(
  currentKey: TableSort,
  currentDir: SortDir,
  clickedKey: TableSort
): { key: TableSort; dir: SortDir } {
  if (clickedKey === currentKey) {
    return { key: clickedKey, dir: currentDir === "asc" ? "desc" : "asc" };
  }
  return { key: clickedKey, dir: DEFAULT_DIR[clickedKey] };
}

/**
 * Return a new, sorted array. Never mutates the input.
 * For `applied`/`salary`, rows with a null value always sort to the end,
 * regardless of direction — direction orders only the rows that have a value.
 */
export function sortApplications(
  apps: AppWithJob[],
  key: TableSort,
  dir: SortDir
): AppWithJob[] {
  const flip = dir === "asc" ? 1 : -1;
  const copy = [...apps];

  switch (key) {
    case "company":
      return copy.sort(
        (a, b) =>
          flip *
          (a.job.company.toLowerCase().localeCompare(b.job.company.toLowerCase()) ||
            a.job.title.toLowerCase().localeCompare(b.job.title.toLowerCase()))
      );
    case "status":
      return copy.sort(
        (a, b) =>
          flip *
          ((STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99) ||
            a.job.company.toLowerCase().localeCompare(b.job.company.toLowerCase()))
      );
    case "applied":
      return copy.sort((a, b) =>
        nullsLast(a.appliedAt?.getTime() ?? null, b.appliedAt?.getTime() ?? null, flip)
      );
    case "salary":
      return copy.sort((a, b) =>
        nullsLast(a.job.salaryMin ?? null, b.job.salaryMin ?? null, flip)
      );
    case "lastActivity":
    default:
      return copy.sort((a, b) => flip * (a.updatedAt.getTime() - b.updatedAt.getTime()));
  }
}

/** Comparator that keeps nulls at the end in both directions. */
function nullsLast(a: number | null, b: number | null, flip: number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // a after b
  if (b === null) return -1; // a before b
  return flip * (a - b);
}
```

Keep the existing `import type { AppWithJob }` line and the unchanged `filterApplications`, `summarize`, `ApplicationSummary`, and `TableFilter`. Remove the old `sortApplications` body and old `TableSort` definition only.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- src/lib/applications/table.test.ts`
Expected: PASS (all sort/nextSort cases green). If old tests referenced `sortApplications(apps, "x")` with two args, update them to three args (`..., DEFAULT_DIR.x`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/applications/table.ts src/lib/applications/table.test.ts
git commit -m "feat(applications): sort by direction + status/salary keys"
```

---

## Task 2: `markAppliedToday` server action

**Files:**
- Modify: `src/lib/applications/actions.ts`

- [ ] **Step 1: Add the action**

After the existing `updateStatus` function in `src/lib/applications/actions.ts`, add:

```ts
/** Set status to Applied and stamp the applied date to now (always overwrites). */
export async function markAppliedToday(applicationId: string) {
  const user = await requireUser();
  await prisma.application.updateMany({
    where: { id: applicationId, userId: user.id },
    data: { status: "applied", appliedAt: new Date() },
  });
  revalidatePath("/applications");
}
```

(`requireUser`, `prisma`, `revalidatePath` are already imported at the top of the file.)

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/applications/actions.ts
git commit -m "feat(applications): add markAppliedToday server action"
```

---

## Task 3: `ui/drawer.tsx` — right-side slide-over

**Files:**
- Create: `src/components/ui/drawer.tsx`

- [ ] **Step 1: Create the wrapper**

Built on the same base-ui `dialog` primitive as `ui/dialog.tsx`, positioned at the right edge with `tw-animate-css` slide utilities. Write `src/components/ui/drawer.tsx`:

```tsx
"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

function Drawer(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root {...props} />;
}

function DrawerClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close {...props} />;
}

function DrawerContent({
  className,
  children,
  ...props
}: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
      <DialogPrimitive.Popup
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-full w-[min(94vw,30rem)] flex-col overflow-y-auto border-l border-border bg-card shadow-xl outline-none data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DrawerTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

export { Drawer, DrawerClose, DrawerContent, DrawerTitle };
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/drawer.tsx
git commit -m "feat(ui): add right-side drawer (sheet) on base-ui dialog"
```

---

## Task 4: `ui/context-menu.tsx` — base-ui context menu wrappers

**Files:**
- Create: `src/components/ui/context-menu.tsx`

- [ ] **Step 1: Confirm the API**

Run: `cat node_modules/@base-ui/react/context-menu/index.parts.d.ts`
Confirm exports include `Root`, `Trigger`, `Portal`, `Positioner`, `Popup`, `Item`, `Separator`, `SubmenuRoot`, `SubmenuTrigger`. (`Trigger` renders a `<div>` — callers mount it on a `<tr>` via the `render` prop.)

- [ ] **Step 2: Create the wrapper**

Reuse the popup/item styling from `ui/menu.tsx`. Write `src/components/ui/context-menu.tsx`:

```tsx
"use client";

import { ContextMenu as Primitive } from "@base-ui/react/context-menu";
import { cn } from "@/lib/utils";

function ContextMenu(props: Primitive.Root.Props) {
  return <Primitive.Root {...props} />;
}

function ContextMenuTrigger(props: Primitive.Trigger.Props) {
  return <Primitive.Trigger {...props} />;
}

const popupClass =
  "z-50 min-w-44 origin-(--transform-origin) rounded-xl border border-border bg-card p-1 shadow-lg outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95";

function ContextMenuContent({
  className,
  children,
  ...props
}: Primitive.Popup.Props) {
  return (
    <Primitive.Portal>
      <Primitive.Positioner className="z-50 outline-none">
        <Primitive.Popup className={cn(popupClass, className)} {...props}>
          {children}
        </Primitive.Popup>
      </Primitive.Positioner>
    </Primitive.Portal>
  );
}

const itemClass =
  "flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-40 data-disabled:pointer-events-none";

function ContextMenuItem({ className, ...props }: Primitive.Item.Props) {
  return <Primitive.Item className={cn(itemClass, className)} {...props} />;
}

function ContextMenuSeparator({ className, ...props }: Primitive.Separator.Props) {
  return <Primitive.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}

function ContextMenuSubmenu(props: Primitive.SubmenuRoot.Props) {
  return <Primitive.SubmenuRoot {...props} />;
}

function ContextMenuSubmenuTrigger({ className, ...props }: Primitive.SubmenuTrigger.Props) {
  return <Primitive.SubmenuTrigger className={cn(itemClass, "justify-between", className)} {...props} />;
}

function ContextMenuSubmenuContent({
  className,
  children,
  ...props
}: Primitive.Popup.Props) {
  return (
    <Primitive.Portal>
      <Primitive.Positioner className="z-50 outline-none" sideOffset={4}>
        <Primitive.Popup className={cn(popupClass, className)} {...props}>
          {children}
        </Primitive.Popup>
      </Primitive.Positioner>
    </Primitive.Portal>
  );
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSubmenu,
  ContextMenuSubmenuTrigger,
  ContextMenuSubmenuContent,
};
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. If `Primitive.Separator.Props`/`SubmenuTrigger.Props` namespaces differ, fall back to typing those wrappers' props as `React.ComponentProps<typeof Primitive.Separator>` etc. (check the `.d.ts` namespace exports printed in Step 1).

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/context-menu.tsx
git commit -m "feat(ui): add context-menu wrappers on base-ui"
```

---

## Task 5: `application-context-menu.tsx` — per-row menu

**Files:**
- Create: `src/components/application-context-menu.tsx`

- [ ] **Step 1: Create the component**

It mounts the context-menu trigger on a `<tr>` (via `render`) and exposes actions through callbacks owned by the table. Write `src/components/application-context-menu.tsx`:

```tsx
"use client";

import { ExternalLink, CalendarCheck, PencilLine, Trash2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSubmenu,
  ContextMenuSubmenuTrigger,
  ContextMenuSubmenuContent,
} from "@/components/ui/context-menu";
import { KANBAN_COLUMNS, type KanbanStatus } from "@/lib/applications/kanban";
import type { AppWithJob } from "@/app/(app)/applications/page";
import { cn } from "@/lib/utils";

const DOT: Record<KanbanStatus, string> = {
  saved: "bg-[#9aa0b0]",
  applied: "bg-[#7c63ec]",
  interviewing: "bg-[#e0a818]",
  offer: "bg-[#3bbf52]",
  rejected: "bg-[#d57272]",
};

interface Props {
  app: AppWithJob;
  rowClassName: string;
  onOpenDetail: () => void;
  onChangeStatus: (next: KanbanStatus) => void;
  onMarkAppliedToday: () => void;
  onDelete: () => void;
  children: React.ReactNode; // the <td> cells
}

export function ApplicationContextMenu({
  app,
  rowClassName,
  onOpenDetail,
  onChangeStatus,
  onMarkAppliedToday,
  onDelete,
  children,
}: Props) {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <tr
            tabIndex={0}
            className={rowClassName}
            onClick={onOpenDetail}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenDetail();
              }
            }}
          />
        }
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuSubmenu>
          <ContextMenuSubmenuTrigger>Change status</ContextMenuSubmenuTrigger>
          <ContextMenuSubmenuContent>
            {KANBAN_COLUMNS.map(({ status, label }) => (
              <ContextMenuItem
                key={status}
                disabled={app.status === status}
                onClick={() => onChangeStatus(status)}
              >
                <span className={cn("size-1.5 rounded-full", DOT[status])} />
                {label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubmenuContent>
        </ContextMenuSubmenu>

        <ContextMenuItem onClick={onMarkAppliedToday}>
          <CalendarCheck className="size-4" /> Mark applied today
        </ContextMenuItem>

        {app.job.url ? (
          <ContextMenuItem
            render={<a href={app.job.url} target="_blank" rel="noopener noreferrer" />}
          >
            <ExternalLink className="size-4" /> Open job posting
          </ContextMenuItem>
        ) : (
          <ContextMenuItem disabled>
            <ExternalLink className="size-4" /> Open job posting
          </ContextMenuItem>
        )}

        <ContextMenuItem onClick={onOpenDetail}>
          <PencilLine className="size-4" /> View / edit details
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          onClick={onDelete}
          className="text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
        >
          <Trash2 className="size-4" /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. (`ContextMenuItem` accepts `render` because it spreads `Primitive.Item.Props`, which includes the base-ui `render` prop.)

- [ ] **Step 3: Commit**

```bash
git add src/components/application-context-menu.tsx
git commit -m "feat(applications): add per-row right-click context menu"
```

---

## Task 6: Wire sortable headers + context menu into the table

**Files:**
- Modify: `src/components/applications-table.tsx`

- [ ] **Step 1: Update imports and the SORTS list**

In `src/components/applications-table.tsx`, update the table-lib import to include the new symbols and add icons:

```ts
import { ChevronUp, ChevronDown, Search } from "lucide-react";
import {
  filterApplications,
  sortApplications,
  summarize,
  nextSort,
  DEFAULT_DIR,
  type TableFilter,
  type TableSort,
  type SortDir,
} from "@/lib/applications/table";
import { ApplicationContextMenu } from "@/components/application-context-menu";
import { markAppliedToday, deleteApplication } from "@/lib/applications/actions";
```

Replace the `SORTS` constant with all five keys:

```ts
const SORTS: { key: TableSort; label: string }[] = [
  { key: "company", label: "Company" },
  { key: "status", label: "Status" },
  { key: "applied", label: "Applied date" },
  { key: "salary", label: "Salary" },
  { key: "lastActivity", label: "Last activity" },
];
```

- [ ] **Step 2: Add direction state and update derived rows**

Replace `const [sort, setSort] = useState<TableSort>("lastActivity");` with:

```ts
  const [sort, setSort] = useState<TableSort>("lastActivity");
  const [dir, setDir] = useState<SortDir>("desc");
```

Update the `rows` memo:

```ts
  const rows = useMemo(
    () => sortApplications(filterApplications(apps, { search, filter }), sort, dir),
    [apps, search, filter, sort, dir]
  );
```

Add a sort handler (place near `handleStatus`):

```ts
  function applySort(key: TableSort) {
    const n = nextSort(sort, dir, key);
    setSort(n.key);
    setDir(n.dir);
  }
```

- [ ] **Step 3: Add optimistic mark-applied and delete handlers**

Add these alongside `handleStatus` (they mirror its optimistic + per-row rollback pattern):

```ts
  function handleMarkApplied(app: AppWithJob) {
    const prevStatus = app.status;
    const prevAppliedAt = app.appliedAt;
    const now = new Date();
    setApps((prev) =>
      prev.map((a) => (a.id === app.id ? { ...a, status: "applied", appliedAt: now } : a))
    );
    setError(null);
    pendingRef.current++;
    startTransition(async () => {
      try {
        await markAppliedToday(app.id);
      } catch {
        setApps((prev) =>
          prev.map((a) =>
            a.id === app.id ? { ...a, status: prevStatus, appliedAt: prevAppliedAt } : a
          )
        );
        setError("Failed to update. Please try again.");
      } finally {
        pendingRef.current--;
      }
    });
  }

  function handleDelete(app: AppWithJob) {
    const snapshot = apps;
    setApps((prev) => prev.filter((a) => a.id !== app.id));
    setError(null);
    pendingRef.current++;
    startTransition(async () => {
      try {
        await deleteApplication(app.id);
      } catch {
        setApps(snapshot);
        setError("Failed to delete. Please try again.");
      } finally {
        pendingRef.current--;
      }
    });
  }
```

- [ ] **Step 4: Make the sort dropdown drive both key and direction**

Replace the `<select>`'s `onChange` with:

```tsx
          <select
            value={sort}
            onChange={(e) => applySort(e.target.value as TableSort)}
            aria-label="Sort applications"
            className="h-9 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground"
          >
```

(Selecting a key applies its default direction via `nextSort`; re-selecting the same key flips it.)

- [ ] **Step 5: Replace the static `<thead>` with sortable header buttons**

Define a small header config and helper above the `return`, then render buttons. Replace the existing `<thead>…</thead>` block with:

```tsx
              <thead>
                <tr className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {([
                    { key: "company", label: "Company / Role" },
                    { key: "status", label: "Status" },
                    { key: "applied", label: "Applied" },
                    { key: "salary", label: "Salary" },
                    { key: "lastActivity", label: "Last activity" },
                  ] as { key: TableSort; label: string }[]).map((col) => (
                    <th key={col.key} className="px-4 py-3" aria-sort={sort === col.key ? (dir === "asc" ? "ascending" : "descending") : "none"}>
                      <button
                        type="button"
                        onClick={() => applySort(col.key)}
                        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground"
                      >
                        {col.label}
                        {sort === col.key &&
                          (dir === "asc" ? (
                            <ChevronUp className="size-3" />
                          ) : (
                            <ChevronDown className="size-3" />
                          ))}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
```

- [ ] **Step 6: Wrap each row in `ApplicationContextMenu`**

Extract the row class to a constant near the top of the component body:

```ts
  const rowClass =
    "cursor-pointer border-t border-border/60 text-sm transition hover:bg-muted/30 focus-visible:bg-muted/40 focus-visible:outline-none";
```

Replace the `{rows.map((app) => ( <tr …>…</tr> ))}` block with the same cells wrapped by the context menu (the `<tr>` now comes from `ApplicationContextMenu` via `render`, so the `.map` returns `ApplicationContextMenu` with the `<td>`s as children):

```tsx
                {rows.map((app) => (
                  <ApplicationContextMenu
                    key={app.id}
                    app={app}
                    rowClassName={rowClass}
                    onOpenDetail={() => openDetail(app)}
                    onChangeStatus={(next) => handleStatus(app, next)}
                    onMarkAppliedToday={() => handleMarkApplied(app)}
                    onDelete={() => handleDelete(app)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <CompanyLogo company={app.job.company} size={36} />
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
                  </ApplicationContextMenu>
                ))}
```

Leave the `rows.length === 0` empty-row `<tr>` block as-is below the map.

- [ ] **Step 7: Type-check and run unit tests**

Run: `pnpm exec tsc --noEmit && pnpm test -- src/lib/applications`
Expected: no type errors; application lib tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/applications-table.tsx
git commit -m "feat(applications): sortable headers + row context menu wiring"
```

---

## Task 7: Rework the detail panel into a read-first drawer

**Files:**
- Modify: `src/components/application-detail-panel.tsx`

- [ ] **Step 1: Rewrite the component**

Keep the same export name and `{ app, open, onOpenChange }` props (the table passes these unchanged). Swap `Dialog` for `Drawer`, add a read-first header/summary/tracking layout, and gate the existing edit form behind an `editing` toggle. Replace the whole file with:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { Trash2, ExternalLink } from "lucide-react";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CompanyLogo } from "@/components/company-logo";
import { StatusPill } from "@/components/status-pill";
import { KanbanStatus } from "@/lib/applications/kanban";
import {
  updateApplicationDetails,
  deleteApplication,
  updateStatus,
} from "@/lib/applications/actions";
import type { AppWithJob } from "@/app/(app)/applications/page";

function toDateInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function fmt(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

interface DetailProps {
  app: AppWithJob | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApplicationDetailPanel({ app, open, onOpenChange }: DetailProps) {
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [pendingAction, setPendingAction] = useState<"save" | "delete" | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset transient UI whenever a different application is shown or the drawer closes.
  useEffect(() => {
    setError(null);
    setEditing(false);
    setPendingAction(null);
  }, [app?.id, open]);

  if (!app) return null;
  const isPaste = app.job.source === "paste";
  const hasHtml = Boolean(app.job.descriptionHtml);
  const hasText = Boolean(app.job.descriptionText?.trim());

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const appliedAtRaw = String(fd.get("appliedAt") ?? "");
    setError(null);
    setPendingAction("save");
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
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleDelete() {
    setPendingAction("delete");
    startTransition(async () => {
      try {
        await deleteApplication(app!.id);
        onOpenChange(false);
      } catch {
        setError("Could not delete this application.");
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleStatus(next: KanbanStatus) {
    if (next === app!.status) return;
    startTransition(async () => {
      try {
        await updateStatus(app!.id, next);
      } catch {
        setError("Could not update status.");
      }
    });
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DrawerContent>
        <div className="flex flex-col gap-5 p-6">
          {/* Header */}
          <div className="flex items-start gap-3">
            <CompanyLogo company={app.job.company} size={44} />
            <div className="min-w-0 flex-1">
              <DrawerTitle className="truncate">{app.job.title}</DrawerTitle>
              <p className="text-sm text-muted-foreground">{app.job.company}</p>
            </div>
            <DrawerClose
              render={
                <Button type="button" variant="ghost" aria-label="Close">
                  ×
                </Button>
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={app.status as KanbanStatus} onChange={handleStatus} />
            <span className="text-sm text-muted-foreground">
              {app.job.salary ?? "—"}
              {app.job.location ? ` · ${app.job.location}` : ""}
            </span>
            {app.job.url && (
              <a
                href={app.job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
              >
                View original <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>

          <hr className="border-border" />

          {/* Summary */}
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Job summary
            </h3>
            {hasHtml ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-none"
                // Sanitized at ingest via sanitize-html (allowlisted tags only).
                dangerouslySetInnerHTML={{ __html: app.job.descriptionHtml! }}
              />
            ) : hasText ? (
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {app.job.descriptionText}
              </div>
            ) : (
              <p className="text-sm italic text-muted-foreground">
                No description — this role was added manually.
              </p>
            )}
          </section>

          <hr className="border-border" />

          {/* Your tracking */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Your tracking
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Applied</div>
                <div className="font-medium">{fmt(app.appliedAt)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Last activity</div>
                <div className="font-medium">{fmt(app.updatedAt)}</div>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Notes</div>
              {app.notes ? (
                <p className="whitespace-pre-wrap text-sm">{app.notes}</p>
              ) : (
                <p className="text-sm italic text-muted-foreground">No notes yet.</p>
              )}
            </div>
          </section>

          {/* Edit form (toggle) */}
          {editing && (
            <form key={app.id} onSubmit={handleSave} className="flex flex-col gap-3 rounded-xl border border-border p-4">
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
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {pendingAction === "save" ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          )}

          {error && !editing && <p className="text-sm text-destructive">{error}</p>}

          {/* Footer actions */}
          {!editing && (
            <div className="mt-1 flex items-center justify-between">
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending}>
                <Trash2 data-icon="inline-start" /> {pendingAction === "delete" ? "Deleting…" : "Delete"}
              </Button>
              <Button type="button" onClick={() => setEditing(true)}>
                Edit
              </Button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
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
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/application-detail-panel.tsx
git commit -m "feat(applications): read-first slide-over detail drawer"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole unit suite**

Run: `pnpm test`
Expected: all pass (in particular `src/lib/applications/table.test.ts`, `applications-table.test.tsx`). If `applications-table.test.tsx` references the old `sortApplications` two-arg signature or asserts the old `<th>` markup, update it to the new header buttons / three-arg sort.

- [ ] **Step 2: Type-check + lint build**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Manual check in the running app**

Start `pnpm dev` (data already seeded). Authenticated as the seeded user, on `/applications`:
- Click each column header — rows reorder; the active header shows ▲/▼; clicking again flips it. The Sort dropdown reflects/drives the same state.
- Click a row — the drawer slides in from the right. For a manual (paste) row it shows "No description — this role was added manually"; the status pill, salary/location, applied date, last activity, and notes render. **Edit** reveals the form; Save persists and closes; Delete removes the row.
- Right-click a row — the menu opens with Change status ▸ (current status disabled), Mark applied today, Open job posting (disabled when the row has no URL), View / edit details, and Delete. Each fires and the table updates optimistically.

- [ ] **Step 4: Final commit (if any test/markup fixups were needed)**

```bash
git add -A
git commit -m "test(applications): update assertions for sortable headers + drawer"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** Task 1 → sortable keys/direction + nulls-last; Task 2 → markAppliedToday; Tasks 3–4 → ui primitives; Task 5 → context menu (all 5 actions incl. disabled Open-posting); Task 6 → headers + dropdown + row wiring + optimistic delete/mark; Task 7 → read-first drawer with description reuse + Edit toggle; Task 8 → tests + manual flows. All spec sections mapped.
- **Type consistency:** `sortApplications(apps, key, dir)`, `nextSort(key, dir, clicked) → {key, dir}`, `DEFAULT_DIR`, `SortDir` used identically across Tasks 1 and 6. `ApplicationDetailPanel({app, open, onOpenChange})` signature unchanged (Task 7) so Task 6's wiring stays valid. Context-menu `render` prop usage matches the base-ui pattern already in the codebase (`DialogClose render={<Button/>}`).
- **Watch-outs:** existing tests using the old 2-arg `sortApplications` or asserting static `<th>` text must be updated (called out in Tasks 1 & 8). If base-ui `Primitive.Separator.Props` / `SubmenuTrigger.Props` namespaces aren't exported, use `React.ComponentProps<typeof Primitive.X>` (Task 4 Step 3).
