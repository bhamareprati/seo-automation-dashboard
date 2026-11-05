import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4 bg-sheet p-6">
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-5/6" />
    </div>
  );
}
