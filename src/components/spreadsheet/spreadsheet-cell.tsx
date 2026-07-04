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
  if (!d) return "";
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
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
          seeded={props.seed !== undefined}
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
  kind, initial, seeded, onCommit, onCancel,
}: { kind: ColumnDef["kind"]; initial: string; seeded: boolean; onCommit: (v: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    if (seeded) {
      const n = ref.current?.value.length ?? 0;
      ref.current?.setSelectionRange(n, n);
    } else {
      ref.current?.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function commit(v: string) {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(v);
  }
  return (
    <input
      ref={ref}
      type={kind === "date" ? "date" : "text"}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => commit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(value); }
        else if (e.key === "Escape") { e.preventDefault(); committedRef.current = true; onCancel(); }
      }}
      className="h-7 w-full rounded border border-input bg-background px-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
    />
  );
}
