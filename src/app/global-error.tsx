"use client";

import { useEffect } from "react";
import "./globals.css";

// global-error replaces the root layout when an error is thrown in it, so it
// must render its own <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="antialiased">
        <div className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
          <div className="text-center">
            <h1 className="text-2xl font-extrabold tracking-tight">Something went wrong</h1>
            <p className="mt-2 max-w-sm text-muted-foreground">
              An unexpected error occurred. Please try again.
            </p>
            <button
              onClick={reset}
              className="mt-6 inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
