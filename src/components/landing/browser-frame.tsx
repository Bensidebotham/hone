import Image from "next/image";

/**
 * Wraps a product screenshot in a macOS-style browser window frame, so app
 * screenshots read clearly as "the product" and stay visually consistent
 * across the landing page.
 */
export function BrowserFrame({
  src,
  alt,
  label,
  priority = false,
  className = "",
}: {
  src: string;
  alt: string;
  label: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-primary/5 ring-1 ring-foreground/5 ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-border/70 bg-muted/40 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-highlight/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-primary/40" />
        <span className="ml-2 text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <Image
        src={src}
        alt={alt}
        width={1440}
        height={900}
        priority={priority}
        sizes="(max-width: 1024px) 100vw, 1100px"
        className="h-auto w-full"
      />
    </div>
  );
}
