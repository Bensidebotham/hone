"use client";

import { CATALOG, type ColumnDef, type ColumnId } from "@/lib/applications/columns";
import { Menu, MenuTrigger, MenuContent } from "@/components/ui/menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal, GripVertical } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ColumnMenuProps {
  columns: ColumnDef[];
  onChange: (next: { order: ColumnId[]; hidden: ColumnId[] }) => void;
}

export function ColumnMenu({ columns, onChange }: ColumnMenuProps) {
  const visibleIds = columns.map((c) => c.id);
  const orderedCatalog: ColumnDef[] = [
    ...columns,
    ...CATALOG.filter((c) => !visibleIds.includes(c.id)),
  ];
  const sensors = useSensors(useSensor(PointerSensor));

  function emit(order: ColumnId[], hidden: ColumnId[]) {
    onChange({ order, hidden });
  }

  function toggle(id: ColumnId, show: boolean) {
    const hiddenNow = CATALOG.map((c) => c.id).filter((cid) => !visibleIds.includes(cid));
    if (show) {
      emit([...visibleIds, id], hiddenNow.filter((h) => h !== id));
    } else {
      emit(visibleIds.filter((v) => v !== id), [...hiddenNow, id]);
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = visibleIds.indexOf(active.id as ColumnId);
    const to = visibleIds.indexOf(over.id as ColumnId);
    if (from === -1 || to === -1) return;
    const nextOrder = arrayMove(visibleIds, from, to);
    const hiddenNow = CATALOG.map((c) => c.id).filter((cid) => !visibleIds.includes(cid));
    emit(nextOrder, hiddenNow);
  }

  return (
    <Menu>
      <MenuTrigger render={<Button variant="secondary" size="sm"><SlidersHorizontal className="size-4" /> Columns</Button>} />
      <MenuContent className="min-w-56 p-1">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
            {orderedCatalog.map((col) => {
              const visible = visibleIds.includes(col.id);
              return (
                <ColumnRow key={col.id} col={col} visible={visible} onToggle={(show) => toggle(col.id, show)} />
              );
            })}
          </SortableContext>
        </DndContext>
      </MenuContent>
    </Menu>
  );
}

function ColumnRow({ col, visible, onToggle }: { col: ColumnDef; visible: boolean; onToggle: (show: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: col.id, disabled: !visible });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50">
      <span onClick={() => onToggle(!visible)} className="inline-flex cursor-pointer">
        <Checkbox checked={visible} aria-label={`Toggle ${col.label}`} />
      </span>
      <span className="flex-1">{col.label}</span>
      {visible && (
        <button {...attributes} {...listeners} aria-label={`Reorder ${col.label}`} className="cursor-grab text-muted-foreground">
          <GripVertical className="size-4" />
        </button>
      )}
    </div>
  );
}
