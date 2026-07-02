import type { ApplicationRow } from "@/app/(app)/applications/page";

export const KANBAN_STATUSES = [
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
] as const;

export type KanbanStatus = (typeof KANBAN_STATUSES)[number];

export const KANBAN_COLUMNS: { status: KanbanStatus; label: string }[] = [
  { status: "saved", label: "Saved" },
  { status: "applied", label: "Applied" },
  { status: "interviewing", label: "Interviewing" },
  { status: "offer", label: "Offer" },
  { status: "rejected", label: "Rejected" },
];

/** Type guard: checks if a string is one of the 5 kanban statuses. */
export function isKanbanStatus(value: string): value is KanbanStatus {
  return (KANBAN_STATUSES as readonly string[]).includes(value);
}

/** Groups an array of applications by status. Every status key is always present. */
export function groupByStatus(
  apps: ApplicationRow[]
): Record<KanbanStatus, ApplicationRow[]> {
  const result = Object.fromEntries(
    KANBAN_STATUSES.map((s) => [s, [] as ApplicationRow[]])
  ) as Record<KanbanStatus, ApplicationRow[]>;

  for (const app of apps) {
    if (isKanbanStatus(app.status)) {
      result[app.status].push(app);
    }
  }

  return result;
}

/**
 * Returns a new grouped object with `appId` moved to `toStatus`.
 * No-op if the app is already in `toStatus` or if `appId` is not found.
 * Does NOT mutate the input.
 */
export function moveApplication(
  grouped: Record<KanbanStatus, ApplicationRow[]>,
  appId: string,
  toStatus: KanbanStatus
): Record<KanbanStatus, ApplicationRow[]> {
  // Find current column
  let fromStatus: KanbanStatus | null = null;
  let app: ApplicationRow | undefined;

  for (const status of KANBAN_STATUSES) {
    const found = grouped[status].find((a) => a.id === appId);
    if (found) {
      fromStatus = status;
      app = found;
      break;
    }
  }

  // No-op: app not found or already in target column
  if (!app || fromStatus === null || fromStatus === toStatus) {
    return { ...grouped };
  }

  const from: KanbanStatus = fromStatus;
  const movedApp: ApplicationRow = app;

  return {
    ...grouped,
    [from]: grouped[from].filter((a) => a.id !== appId),
    [toStatus]: [...grouped[toStatus], { ...movedApp, status: toStatus }],
  };
}
