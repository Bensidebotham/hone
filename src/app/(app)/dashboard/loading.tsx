import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-hidden="true">
      {/* welcome heading */}
      <Skeleton className="h-7 w-48" />

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {/* health column */}
        <div className="space-y-6">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>

        {/* new jobs card */}
        <Skeleton className="h-56 w-full rounded-xl" />

        {/* app updates card */}
        <div className="md:col-span-2 xl:col-span-1">
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>

        {/* funnel card — full row */}
        <div className="md:col-span-2 xl:col-span-3">
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
