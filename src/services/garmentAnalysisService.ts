import type { DetectedGarment, GarmentAnalysisResult } from '../types'
import { BackendUnreachableError, apiFetch, getApiToken } from './apiClient'

/**
 * Garment discovery, powered by MAEVE's real computer-vision service.
 *
 * Flow:
 *   1. upload the photograph to `POST /api/garments/analyze`,
 *   2. the backend runs a real instance-segmentation model (YOLOv8s-seg on
 *      DeepFashion2) and streams progress stages,
 *   3. this module polls the job until it reaches an honest terminal state
 *      and maps the worker's payload onto the app's `GarmentAnalysisResult`.
 *
 * Nothing here is fabricated: a `complete` result contains only what the
 * model detected and the pixel-reader measured; a zero-result, a failing
 * worker, or an unreachable backend all surface truthfully.
 */

export interface AnalyzeOptions {
  onProgress?: (stageIndex: number, totalStages: number, stage: string) => void
}

const POLL_MS = 600
const BACKEND_DOWN_MESSAGE = "MAEVE's wardrobe service is temporarily unavailable."
const CV_DOWN_MESSAGE = 'Garment analysis is temporarily unavailable.'
const UNAUTHENTICATED_MESSAGE = 'Sign in to continue.'

interface JobPayload {
  status?: string
  stage?: string
  stageIndex?: number
  totalStages?: number
  error?: { code?: string; message?: string }
  result?: {
    success?: boolean
    model?: string
    processedInMs?: number
    image?: { width: number; height: number }
    garments?: Record<string, unknown>[]
  }
}

function unreachable(message = BACKEND_DOWN_MESSAGE): GarmentAnalysisResult {
  return { status: 'unreachable', message, garments: [] }
}

function cvUnavailable(message = CV_DOWN_MESSAGE): GarmentAnalysisResult {
  return { status: 'cv-unavailable', message, garments: [] }
}

function unauthenticated(message = UNAUTHENTICATED_MESSAGE): GarmentAnalysisResult {
  return { status: 'unauthenticated', message, garments: [] }
}

/**
 * True when the whole backend is unreachable. A 5xx from `/api` usually means
 * the dev proxy could not reach the backend (502 Bad Gateway), not that the
 * analysis worker failed — probe /health to tell the two apart.
 */
async function backendDown(): Promise<boolean> {
  try {
    const res = await apiFetch('/health')
    return res.status >= 500
  } catch {
    return true
  }
}

export async function isAnalysisAvailable(): Promise<boolean> {
  try {
    const res = await apiFetch('/health')
    if (!res.ok) return false
    const body = res.body as { cv?: { available?: boolean } }
    return body?.cv?.available === true
  } catch {
    return false
  }
}

function mapGarment(g: Record<string, unknown>): DetectedGarment {
  return {
    id: typeof g.id === 'string' ? g.id : undefined,
    imageUrl: typeof g.isolatedImageUrl === 'string' ? g.isolatedImageUrl : undefined,
    thumbnailUrl: typeof g.thumbnailUrl === 'string' ? g.thumbnailUrl : undefined,
    originalImageUrl:
      typeof g.originalImageUrl === 'string' ? g.originalImageUrl : undefined,
    category: (g.category as DetectedGarment['category']) ?? null,
    subcategory: typeof g.subcategory === 'string' ? g.subcategory : null,
    color: typeof g.color === 'string' ? g.color : null,
    colorHex: typeof g.colorHex === 'string' ? g.colorHex : null,
    secondaryColor: typeof g.secondaryColor === 'string' ? g.secondaryColor : null,
    colorConfidence: typeof g.colorConfidence === 'number' ? g.colorConfidence : null,
    pattern: (g.pattern as DetectedGarment['pattern']) ?? null,
    material: typeof g.material === 'string' ? g.material : null,
    style: (g.style as DetectedGarment['style']) ?? null,
    sleeve: typeof g.sleeve === 'string' ? g.sleeve : null,
    length: typeof g.length === 'string' ? g.length : null,
    season: typeof g.season === 'string' ? g.season : null,
    needsUserInput: g.needsUserInput === true,
    confidence: typeof g.confidence === 'number' ? g.confidence : null,
    boundingBox: (g.boundingBox as DetectedGarment['boundingBox']) ?? null,
  }
}

/** Upload a photograph and wait for the real CV pipeline to finish. */
export async function analyzeGarments(
  file: File,
  options: AnalyzeOptions = {},
): Promise<GarmentAnalysisResult> {
  if (!getApiToken()) return unauthenticated()

  // 1. Upload.
  const fd = new FormData()
  fd.append('image', file)
  let upload: Awaited<ReturnType<typeof apiFetch>>
  try {
    upload = await apiFetch('/garments/analyze', { method: 'POST', body: fd })
  } catch (err) {
    if (err instanceof BackendUnreachableError) return unreachable()
    return unreachable()
  }
  if (!upload.ok) {
    if (upload.status === 401 || upload.status === 403) {
      return unauthenticated()
    }
    if (upload.status >= 500) {
      return (await backendDown()) ? unreachable() : cvUnavailable()
    }
    const uploadBody = upload.body as { message?: string } | null
    return {
      status: 'failed',
      message: uploadBody?.message ?? 'Something went wrong while uploading the photograph.',
      garments: [],
    }
  }
  const uploadBody = upload.body as { jobId?: string; totalStages?: number } | null
  const { jobId } = uploadBody ?? {}
  if (typeof jobId !== 'string') return unreachable()
  const totalStages = uploadBody?.totalStages ?? 7

  // 2. Poll until terminal.
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    let job: JobPayload | null = null
    try {
      const res = await apiFetch(`/garments/analyze/${jobId}`)
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return unauthenticated()
        if (res.status === 404) {
          return {
            status: 'failed',
            message: 'The analysis expired before it finished. Please try again.',
            garments: [],
          }
        }
        if (res.status >= 500) {
          return (await backendDown()) ? unreachable() : cvUnavailable()
        }
        return unreachable()
      }
      job = res.body as JobPayload
    } catch {
      return unreachable()
    }
    if (!job) return unreachable()

    const stageIndex = Math.max(0, Math.min(job.stageIndex ?? 0, (job.totalStages ?? totalStages) - 1))
    options.onProgress?.(stageIndex, job.totalStages ?? totalStages, job.stage ?? 'ANALYZING')

    if (job.status === 'complete' && job.result) {
      const raw = job.result.garments ?? []
      const garments = raw.map(mapGarment)
      const anyConfident = garments.some((g) => !g.needsUserInput && g.confidence !== null)
      const status =
        garments.length === 0
          ? 'no-detection'
          : anyConfident
            ? 'complete'
            : 'low-confidence'
      return {
        status,
        garments,
        model: job.result.model,
        totalStages: job.totalStages ?? totalStages,
        image: job.result.image,
      }
    }

    if (job.status === 'failed') {
      return cvUnavailable(job.error?.message ?? CV_DOWN_MESSAGE)
    }
    if (job.status !== 'processing' && job.status !== 'queued') {
      return unreachable()
    }
  }
}