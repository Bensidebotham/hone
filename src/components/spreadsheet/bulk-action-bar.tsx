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
