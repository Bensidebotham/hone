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
