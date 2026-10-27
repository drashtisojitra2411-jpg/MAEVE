import { cn } from '../../lib/cn'

interface SkeletonProps {
  className?: string
}

/** Theme-aware loading placeholder with a restrained champagne shimmer. */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden="true" className={cn('skeleton', className)} />
}