"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShowMoreButtonProps {
  expanded: boolean;
  remaining: number;
  onToggle: () => void;
}

export function ShowMoreButton({ expanded, remaining, onToggle }: ShowMoreButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-2 flex w-full items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
    >
      {expanded ? "Show less" : `Show ${remaining} more`}
      <ChevronDown
        className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
      />
    </button>
  );
}
