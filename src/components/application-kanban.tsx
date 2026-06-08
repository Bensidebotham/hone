"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApplicationCard } from "@/components/application-card";
import { updateStatus } from "@/lib/applications/actions";
import {
  KANBAN_COLUMNS,
  groupByStatus,
  moveApplication,
  isKanbanStatus,
} from "@/lib/applications/kanban";
import type { KanbanStatus } from "@/lib/applications/kanban";
import type { AppWithJob } from "@/app/(app)/applications/page";

// ── Droppable column sub-component ───────────────────────────────────────────

interface KanbanColumnProps {
  status: KanbanStatus;
  label: string;
  apps: AppWithJob[];
}

function KanbanColumn({ status, label, apps }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { status },
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </h2>
        {apps.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {apps.length}
          </span>
        )}
      </div>

      <SortableContext
        items={apps.map((a) => a.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className={[
            "flex flex-col gap-2 rounded-lg transition-colors min-h-[60px]",
            isOver ? "bg-accent/40" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {apps.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">None yet</p>
            </div>
          ) : (
            apps.map((app) => <ApplicationCard key={app.id} app={app} />)
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ── Board component ───────────────────────────────────────────────────────────

interface ApplicationKanbanProps {
  applications: AppWithJob[];
}

export function ApplicationKanban({ applications }: ApplicationKanbanProps) {
  const [grouped, setGrouped] = useState(() => groupByStatus(applications));
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Re-sync when the server revalidates and sends fresh props
  useEffect(() => {
    setGrouped(groupByStatus(applications));
  }, [applications]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const appId = String(active.id);

      // Resolve target column status from droppable/sortable data
      const overData = over.data.current as { status?: string } | undefined;
      const rawStatus =
        overData?.status ?? (isKanbanStatus(String(over.id)) ? String(over.id) : null);

      if (!rawStatus || !isKanbanStatus(rawStatus)) return;
      const toStatus = rawStatus as KanbanStatus;

      // Check if already in that column — avoid no-op server calls
      const alreadyThere = grouped[toStatus].some((a) => a.id === appId);
      if (alreadyThere) return;

      // Snapshot for revert
      const snapshot = grouped;

      // Optimistic update
      setGrouped(moveApplication(grouped, appId, toStatus));
      setError(null);

      startTransition(async () => {
        try {
          await updateStatus(appId, toStatus);
        } catch {
          // Revert on failure
          setGrouped(snapshot);
          setError("Failed to save the status change. Please try again.");
        }
      });
    },
    [grouped, startTransition]
  );

  return (
    <TooltipProvider>
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="ml-auto text-destructive/70 hover:text-destructive"
          >
            ×
          </button>
        </div>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-5 gap-4 min-w-[900px]">
          {KANBAN_COLUMNS.map(({ status, label }) => (
            <KanbanColumn
              key={status}
              status={status}
              label={label}
              apps={grouped[status]}
            />
          ))}
        </div>
      </DndContext>
    </TooltipProvider>
  );
}
