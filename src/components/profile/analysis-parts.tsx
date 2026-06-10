// Shared presentational bits for AI analysis results (LinkedIn + Site panels).

export function SectionCritique({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-sm">{text}</p>
    </div>
  );
}

export function DimensionScore({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <div className="flex items-end gap-1">
        <span className="text-2xl font-bold">{value}</span>
        <span className="text-muted-foreground text-sm mb-0.5">/ 100</span>
      </div>
    </div>
  );
}

export function SuggestionGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        {label}
      </p>
      <ul className="list-disc pl-5 space-y-1 text-sm">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
