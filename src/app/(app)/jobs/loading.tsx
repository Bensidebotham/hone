import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonJobCard } from "@/components/skeleton-job-card";

export default function JobsLoading() {
  return (
    <div className="max-w-3xl">
      {/* page heading */}
      <Skeleton className="h-7 w-24 mb-2" />
      <Skeleton className="h-4 w-80 mb-6" />

      {/* paste-job card placeholder */}
      <Skeleton className="h-32 w-full rounded-xl mb-8" />

      {/* filter bar placeholder */}
      <Skeleton className="h-9 w-full rounded-md mb-6" />

      {/* job cards */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonJobCard key={i} />
        ))}
      </div>
    </div>
  );
}
