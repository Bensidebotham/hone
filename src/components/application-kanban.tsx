"use client";

import { useState, useTransition, useEffect, useCallback, useRef } from "react";
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
import { cn } from "@/lib/utils";
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
import type { ApplicationRow } from "@/app/(app)/applications/page";

// ── Droppable column sub-component ───────────────────────────────────────────

interface KanbanColumnProps {
  status: KanbanStatus;
  label: string;
  apps: ApplicationRow[];
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
          className={cn(
            "flex flex-col gap-2 rounded-lg transition-colors min-h-[60px]",
            isOver && "bg-accent/40"
          )}
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
  applications: ApplicationRow[];
}

export function ApplicationKanban({ applications }: ApplicationKanbanProps) {
  const [grouped, setGrouped] = useState(() => groupByStatus(applications));
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const pendingRef = useRef(0);

  // Re-sync when the server revalidates and sends fresh props,
  // but skip while a drag transition is in flight to avoid clobbering optimistic state.
  useEffect(() => {
    if (pendingRef.current === 0) setGrouped(groupByStatus(applications));
  }, [applications]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
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

      // Snapshot for revert (captured synchronously before the optimistic update)
      const snapshot = grouped;

      // Optimistic update (functional form to avoid stale closure)
      setGrouped((prev) => moveApplication(prev, appId, toStatus));
      setError(null);

      pendingRef.current++;
      startTransition(async () => {
        try {
          await updateStatus(appId, toStatus);
        } catch {
          // Revert on failure
          setGrouped(snapshot);
          setError("Failed to save the status change. Please try again.");
        } finally {
          pendingRef.current--;
        }
      });
    },
    [grouped]
  );

  return (
    <TooltipProvider>
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-4 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
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
