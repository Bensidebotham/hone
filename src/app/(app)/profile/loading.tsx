import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <div aria-hidden="true">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-44" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
