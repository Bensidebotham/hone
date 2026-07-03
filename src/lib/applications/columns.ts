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
  { id: "role", label: "Role", kind: "role", field: "title", editable: true, sortable: false },
  { id: "status", label: "Status", kind: "status", field: "status", editable: true, sortable: true },
  { id: "appliedAt", label: "Applied", kind: "date", field: "appliedAt", editable: true, sortable: true },
  { id: "followUpDate", label: "Follow-up", kind: "date", field: "followUpDate", editable: true, sortable: true },
  { id: "salary", label: "Salary", kind: "text", field: "salary", editable: true, sortable: true },
  { id: "source", label: "Source", kind: "text", field: "source", editable: true, sortable: true },
  { id: "contact", label: "Contact", kind: "text", field: "contact", editable: true, sortable: true },
  { id: "nextStep", label: "Next step", kind: "text", field: "nextStep", editable: true, sortable: true },
  { id: "location", label: "Location", kind: "text", field: "location", editable: true, sortable: false },
  { id: "url", label: "URL", kind: "text", field: "url", editable: true, sortable: false },
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
