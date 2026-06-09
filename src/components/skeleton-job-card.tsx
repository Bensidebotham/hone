import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function SkeletonJobCard() {
  return (
    <Card aria-hidden="true">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1.5 flex-1">
            {/* title */}
            <Skeleton className="h-4 w-1/2" />
            {/* company · location */}
            <Skeleton className="h-3 w-1/3" />
          </div>
          {/* badge + bookmark */}
          <div className="flex items-center gap-2 shrink-0">
            <Skeleton className="h-5 w-12 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* salary */}
        <Skeleton className="h-3 w-28 mb-2" />
        {/* view posting link */}
        <Skeleton className="h-3 w-20 mb-3" />
        {/* action buttons */}
        <div className="flex items-center gap-2 mt-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}
