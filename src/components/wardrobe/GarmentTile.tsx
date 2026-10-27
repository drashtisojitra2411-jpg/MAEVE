import { motion } from 'framer-motion'
import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../lib/cn'
import { maeveEase } from '../../lib/motion'
import type { Garment } from '../../types'
import { GarmentPhoto } from './GarmentPhoto'
import { categoryLabels } from '../../lib/garmentCatalogue'

interface GarmentTileProps {
  garment: Garment
  className?: string
  /** Render as a featured/large tile */
  featured?: boolean
  /** Optional hover overlay content */
  overlay?: React.ReactNode
  /** When provided, opens the edit metadata modal. */
  onEdit?: () => void
  /** When provided, renders a remove control (two-step confirm). */
  onDelete?: () => void
}

/**
 * Wardrobe archive tile — image-dominant, editorial.
 * Metadata is revealed only on hover via a slide-up gradient overlay.
 * No card borders; images sit directly on the page background.
 */
export function GarmentTile({ garment, className, featured, overlay, onEdit, onDelete }: GarmentTileProps) {
  const [confirming, setConfirming] = useState(false)

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirming) {
      setConfirming(true)
      window.setTimeout(() => setConfirming(false), 2600)
      return
    }
    setConfirming(false)
    onDelete?.()
  }

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.4, ease: maeveEase }}
      onClick={() => onEdit?.()}
      className={cn('group relative cursor-pointer select-none', className)}
    >
      {/* Image frame — portrait card */}
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-sm border border-line/40 bg-surface/50 transition-colors duration-300 group-hover:border-accent/40',
          featured ? 'aspect-[3/4]' : 'aspect-[3/4]',
        )}
      >
        <GarmentPhoto
          garment={garment}
          className="absolute inset-0"
          imgClassName="group-hover:scale-[1.05] transition-transform duration-700 ease-out"
        />

        {/* Hover metadata overlay — slides up from bottom */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-espresso/90 via-espresso/50 to-transparent p-3 pt-8 opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0 translate-y-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-ivory">
            {garment.name}
          </p>
          {garment.category && (
            <p className="mt-0.5 text-[8px] uppercase tracking-[0.18em] text-ivory/70">
              {categoryLabels[garment.category] ?? garment.category}
            </p>
          )}
          {(garment.color || garment.style) && (
            <p className="mt-0.5 text-[8px] uppercase tracking-[0.15em] text-ivory/50">
              {[garment.color, garment.style].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        {/* Actions bar — appears on hover, top-right */}
        <div className="absolute right-2 top-2 z-20 flex items-center gap-1.5 opacity-0 backdrop-blur-sm transition-all duration-300 group-hover:opacity-100">
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
              aria-label="Edit piece metadata"
              className="flex h-7 items-center gap-1 border border-white/20 bg-black/40 px-2 text-[8px] uppercase tracking-[0.15em] text-white hover:bg-black/60"
            >
              <Pencil className="h-2.5 w-2.5" strokeWidth={1.5} />
              Edit
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              aria-label={confirming ? 'Confirm removal' : 'Remove piece'}
              className={cn(
                'flex h-7 items-center gap-1 px-2.5 text-[8px] uppercase tracking-[0.15em] transition-colors',
                confirming
                  ? 'bg-red-900/90 text-white opacity-100'
                  : 'border border-white/20 bg-black/40 text-white hover:bg-black/60',
              )}
            >
              <Trash2 className="h-2.5 w-2.5" strokeWidth={1.5} />
              {confirming ? 'Confirm' : 'Remove'}
            </button>
          )}
        </div>

        {overlay}
      </div>
    </motion.div>
  )
}