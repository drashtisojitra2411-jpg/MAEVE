import { Skeleton } from './Skeleton'
import { WeatherSkeleton } from './WeatherSkeleton'

/** Full-page skeleton mirroring DashboardPage's layout. */
export function DashboardSkeleton() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-14" aria-busy="true" aria-label="Loading dashboard">
      {/* Greeting + weather */}
      <div className="mb-16 flex flex-col justify-between gap-8 md:flex-row md:items-end">
        <div>
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="mt-3 h-9 w-72 max-w-full" />
        </div>
        <WeatherSkeleton />
      </div>

      {/* Today's look */}
      <div className="mb-20">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="mt-2 h-8 w-80 max-w-full" />
          </div>
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="grid grid-cols-3 gap-4 sm:gap-6">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <Skeleton className="aspect-[3/4] w-full" />
                  <Skeleton className="mx-auto mt-3 h-2.5 w-20" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col justify-between lg:col-span-5 lg:pl-8">
            <div>
              <Skeleton className="h-16 w-32" />
              <Skeleton className="mt-5 h-4 w-56 max-w-full" />
              <div className="mt-8 space-y-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rarely worn */}
      <div className="mb-20">
        <div className="mb-8 flex items-end justify-between">
          <Skeleton className="h-2.5 w-48" />
          <Skeleton className="h-2.5 w-20" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Skeleton className="aspect-[3/4] w-full" />
              <Skeleton className="mx-auto mt-3 h-2.5 w-20" />
            </div>
          ))}
        </div>
      </div>

      {/* Wardrobe summary + insights */}
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <Skeleton className="h-2.5 w-36" />
          <Skeleton className="mt-4 h-16 w-40" />
          <Skeleton className="mt-4 h-3 w-64 max-w-full" />
        </div>
        <div className="lg:col-span-6">
          <Skeleton className="h-2.5 w-24" />
          <div className="mt-6 space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}