import { Skeleton } from "@/components/ui/skeleton";

export default function ResumeLoading() {
  return (
    <div aria-hidden="true">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Skeleton className="h-80 rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
