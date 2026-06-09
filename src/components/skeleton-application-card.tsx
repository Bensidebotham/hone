import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function SkeletonApplicationCard() {
  return (
    <Card aria-hidden="true">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-1">
          {/* job title */}
          <Skeleton className="h-3.5 w-3/4" />
          {/* drag handle */}
          <Skeleton className="h-5 w-5 rounded shrink-0" />
        </div>
        {/* company · location */}
        <Skeleton className="h-3 w-1/2 mt-1" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        {/* status label */}
        <Skeleton className="h-3 w-10" />
        {/* status select */}
        <Skeleton className="h-8 w-full rounded-md" />
        {/* notes label */}
        <Skeleton className="h-3 w-8" />
        {/* notes textarea */}
        <Skeleton className="h-14 w-full rounded-md" />
      </CardContent>
    </Card>
  );
}
