import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonApplicationCard } from "@/components/skeleton-application-card";

const COLUMN_COUNT = 5;
const CARDS_PER_COLUMN = 2;

export default function ApplicationsLoading() {
  return (
    <div className="overflow-x-auto" aria-hidden="true">
      {/* page heading */}
      <Skeleton className="h-7 w-40 mb-2" />
      <Skeleton className="h-4 w-72 mb-6" />

      {/* kanban columns */}
      <div className="grid grid-cols-5 gap-4 min-w-[900px]">
        {Array.from({ length: COLUMN_COUNT }).map((_, col) => (
          <div key={col} className="flex flex-col gap-3">
            {/* column header */}
            <Skeleton className="h-3 w-20" />
            <div className="flex flex-col gap-2">
              {Array.from({ length: CARDS_PER_COLUMN }).map((_, card) => (
                <SkeletonApplicationCard key={card} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
