// Static, token-built representation of the dashboard — no screenshot dependency.
export function AppPreview() {
  const tiles = [
    { label: "Applied this week", value: "7" },
    { label: "Applied", value: "42" },
    { label: "Interviewing", value: "3" },
    { label: "Response rate", value: "31%" },
  ];
  const funnel = [
    { label: "Saved", v: 12, w: "w-full" },
    { label: "Applied", v: 42, w: "w-4/5" },
    { label: "Interviewing", v: 3, w: "w-2/5" },
    { label: "Offer", v: 1, w: "w-1/5" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-xl shadow-primary/5 ring-1 ring-foreground/5">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-highlight/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-primary/40" />
        <span className="ml-2 text-xs font-medium text-muted-foreground">hone · dashboard</span>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg bg-muted/60 p-3">
            <p className="truncate text-[10px] font-medium text-muted-foreground">{t.label}</p>
            <p className="text-lg font-extrabold tracking-tight">{t.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="col-span-2 rounded-lg bg-muted/60 p-3">
          <p className="mb-2 text-[10px] font-medium text-muted-foreground">Applications over time</p>
          <svg viewBox="0 0 200 60" className="h-16 w-full" preserveAspectRatio="none">
            <polyline
              points="0,50 30,42 60,46 90,30 120,34 150,18 200,12"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.5"
            />
          </svg>
        </div>
        <div className="rounded-lg bg-muted/60 p-3">
          <p className="mb-2 text-[10px] font-medium text-muted-foreground">Funnel</p>
          <div className="space-y-1.5">
            {funnel.map((f) => (
              <div key={f.label} className="flex items-center gap-2">
                <div className={`h-2 rounded-full bg-primary/70 ${f.w}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
