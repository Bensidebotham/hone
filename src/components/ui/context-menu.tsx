"use client";

import { ContextMenu as Primitive } from "@base-ui/react/context-menu";
import { cn } from "@/lib/utils";

function ContextMenu(props: Primitive.Root.Props) {
  return <Primitive.Root {...props} />;
}

function ContextMenuTrigger(props: Primitive.Trigger.Props) {
  return <Primitive.Trigger {...props} />;
}

const popupClass =
  "z-50 min-w-44 origin-(--transform-origin) rounded-xl border border-border bg-card p-1 shadow-lg outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95";

function ContextMenuContent({
  className,
  children,
  ...props
}: Primitive.Popup.Props) {
  return (
    <Primitive.Portal>
      <Primitive.Positioner className="z-50 outline-none">
        <Primitive.Popup className={cn(popupClass, className)} {...props}>
          {children}
        </Primitive.Popup>
      </Primitive.Positioner>
    </Primitive.Portal>
  );
}

const itemClass =
  "flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-40 data-disabled:pointer-events-none";

function ContextMenuItem({ className, ...props }: Primitive.Item.Props) {
  return <Primitive.Item className={cn(itemClass, className)} {...props} />;
}

function ContextMenuSeparator({ className, ...props }: Primitive.Separator.Props) {
  return <Primitive.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}

function ContextMenuSubmenu(props: Primitive.SubmenuRoot.Props) {
  return <Primitive.SubmenuRoot {...props} />;
}

function ContextMenuSubmenuTrigger({ className, ...props }: Primitive.SubmenuTrigger.Props) {
  return <Primitive.SubmenuTrigger className={cn(itemClass, "justify-between", className)} {...props} />;
}

function ContextMenuSubmenuContent({
  className,
  children,
  ...props
}: Primitive.Popup.Props) {
  return (
    <Primitive.Portal>
      <Primitive.Positioner className="z-50 outline-none" sideOffset={4}>
        <Primitive.Popup className={cn(popupClass, className)} {...props}>
          {children}
        </Primitive.Popup>
      </Primitive.Positioner>
    </Primitive.Portal>
  );
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSubmenu,
  ContextMenuSubmenuTrigger,
  ContextMenuSubmenuContent,
};
