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
import { STATUS_DOT } from "@/components/status-pill";
import type { AppWithJob } from "@/app/(app)/applications/page";
import { cn } from "@/lib/utils";

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
                <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} />
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
