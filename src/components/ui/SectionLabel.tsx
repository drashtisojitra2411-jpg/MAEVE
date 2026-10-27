import { cn } from '../../lib/cn'

interface SectionLabelProps {
  children: React.ReactNode
  className?: string
}

export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <span
      className={cn(
        'inline-block text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-accent',
        className,
      )}
    >
      {children}
    </span>
  )
}