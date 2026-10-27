import { useState } from 'react'
import { Shirt } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Skeleton } from '../loading/Skeleton'
import type { Garment } from '../../types'
import { resolveAssetUrl } from '../../lib/resolveAssetUrl'

interface GarmentPhotoProps {
  garment: Garment
  className?: string
  imgClassName?: string
  sizes?: string
  eager?: boolean
}

/**
 * Real-fashion garment photograph. Shows a matching skeleton while the image
 * decodes, fades it in, and falls back to a quiet tonal swatch if the source
 * is missing or fails to load.
 *
 * Uses object-fit: contain (not cover) because isolated garment images are
 * transparent PNGs — cover would zoom into blank transparent canvas space.
 */
export function GarmentPhoto({
  garment,
  className,
  imgClassName,
  sizes = '(min-width: 1024px) 33vw, 50vw',
  eager = true,
}: GarmentPhotoProps) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  // Prefer thumbnailUrl (tight-cropped) over isolatedImageUrl (full canvas).
  const rawSrc = (garment as { thumbnailUrl?: string }).thumbnailUrl ?? garment.imageUrl
  const src = resolveAssetUrl(rawSrc)
  const [prevSrc, setPrevSrc] = useState(src)

  if (src !== prevSrc) {
    setPrevSrc(src)
    setLoaded(false)
    setFailed(false)
  }

  const showImage = Boolean(src) && !failed

  return (
    <div
      className={cn('relative isolate overflow-hidden w-full h-full flex items-center justify-center', className)}
      style={{
        background: `linear-gradient(160deg, #faf9f7, ${garment.colorHex ?? '#EDE6D9'} 180%)`,
      }}
    >
      {showImage ? (
        <>
          {!loaded && <Skeleton className="absolute inset-0" />}
          <img
            src={src}
            alt={garment.name}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            sizes={sizes}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={cn(
              'h-full w-full object-contain p-3 transition-[opacity,filter,transform] duration-500 ease-out',
              loaded ? 'opacity-100 blur-none' : 'opacity-0 scale-[1.02] blur-[8px]',
              imgClassName,
            )}
          />
        </>
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: garment.colorHex ?? '#E4DFD3' }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 80% 70% at 50% 0%, rgba(255,255,255,0.35), transparent 60%)',
            }}
          />
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-black/70 via-black/45 to-black/70 p-3 text-center">
          <Shirt className="h-5 w-5 text-ivory/70" strokeWidth={1.25} aria-hidden="true" />
          <span className="text-[9px] uppercase tracking-[0.2em] text-ivory/85">
            Image unavailable
          </span>
        </div>
      )}
    </div>
  )
}