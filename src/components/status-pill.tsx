"use client";

import { KANBAN_COLUMNS } from "@/lib/applications/kanban";
import type { KanbanStatus } from "@/lib/applications/kanban";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "@/components/ui/menu";
import { cn } from "@/lib/utils";

/** Status dot colors — shared so other surfaces (e.g. the row context menu) stay in sync. */
export const STATUS_DOT: Record<KanbanStatus, string> = {
  saved: "bg-[#9aa0b0]",
  applied: "bg-[#7c63ec]",
  interviewing: "bg-[#e0a818]",
  offer: "bg-[#3bbf52]",
  rejected: "bg-[#d57272]",
};

const STYLES: Record<KanbanStatus, { pill: string; dot: string }> = {
  saved: { pill: "bg-[#f0f1f5] text-[#5b6275]", dot: STATUS_DOT.saved },
  applied: { pill: "bg-accent text-accent-foreground", dot: STATUS_DOT.applied },
  interviewing: { pill: "bg-[#fdf4d8] text-[#9a7212]", dot: STATUS_DOT.interviewing },
  offer: { pill: "bg-[#def6e0] text-[#268a3a]", dot: STATUS_DOT.offer },
  rejected: { pill: "bg-[#f8e6e6] text-[#b14a4a]", dot: STATUS_DOT.rejected },
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
