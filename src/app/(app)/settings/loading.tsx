import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div aria-hidden="true">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="h-32 max-w-xl rounded-xl" />
      <Skeleton className="mt-6 h-40 max-w-xl rounded-xl" />
    </div>
  );
}
