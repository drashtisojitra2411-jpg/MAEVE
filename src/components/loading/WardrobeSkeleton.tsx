import { Skeleton } from './Skeleton'

interface WardrobeSkeletonProps {
  count?: number
}

/** Skeleton grid matching WardrobePage's tile layout. */
export function WardrobeSkeleton({ count = 10 }: WardrobeSkeletonProps) {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-7">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Skeleton className="aspect-[3/4] w-full" />
          <Skeleton className="mx-auto mt-3 h-2.5 w-24" />
        </div>
      ))}
    </div>
  )
}