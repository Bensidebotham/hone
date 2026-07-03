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
