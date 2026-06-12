"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error for observability (Vercel captures console output).
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="text-center">
        <p className="text-sm font-semibold text-primary">Something went wrong</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight">
          We hit a snag loading this page
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-muted-foreground">
          An unexpected error occurred. You can try again, and if it keeps happening,
          reload the page.
        </p>
        <Button onClick={reset} className="mt-6">
          Try again
        </Button>
      </div>
    </div>
  );
}
