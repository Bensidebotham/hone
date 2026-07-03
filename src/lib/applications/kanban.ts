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
