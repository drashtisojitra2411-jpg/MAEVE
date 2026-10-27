import { useCallback, useEffect, useState } from 'react'
import type { GeneratedLook, WardrobeItem, WeatherSnapshot } from '../types'
import { getApiToken } from '../services/apiClient'
import { listLooks, deleteLook, updateLookFeedback, saveLook } from '../services/looksApi'
import { readLookHistory } from '../services/lookService'
import { useAuth } from './auth'
import { useWardrobe } from './wardrobe-context'

/**
 * Look history for the signed-in user.
 *
 * The backend is the source of truth when reachable; the local cache is shown
 * immediately and kept as a fallback while offline. Server records carry item
 * snapshots (renderable even if a piece was later deleted); local records
 * resolve their pieces from the current wardrobe.
 */
export interface HistoryLook {
  id: string
  occasion: string
  createdAt: number
  itemIds: string[]
  items: (WardrobeItem & { isAvailable?: boolean })[]
  note: string
  explanation?: string[]
  score: number | null
  breakdown?: GeneratedLook['breakdown']
  pieceScores?: GeneratedLook['pieceScores']
  feedback?: 'like' | 'dislike' | null
  rating?: number | null
  incomplete?: boolean
  missingItemIds?: string[]
  weather: WeatherSnapshot
  source: 'server' | 'local'
}

function localToLooks(userId: string, wardrobe: WardrobeItem[]): HistoryLook[] {
  return readLookHistory(userId).map((record) => ({
    id: record.id,
    occasion: record.occasion,
    createdAt: record.createdAt,
    itemIds: record.itemIds ?? [],
    items: (record.itemIds ?? [])
      .map((id) => wardrobe.find((w) => w.id === id))
      .filter((w): w is WardrobeItem => Boolean(w)),
    note: record.reasoning,
    explanation: [record.reasoning],
    score: null,
    weather: {},
    source: 'local',
  }))
}

function serverToLooks(rows: GeneratedLook[]): HistoryLook[] {
  return rows.map((look) => ({
    id: look.id,
    occasion: look.occasion,
    createdAt: look.createdAt,
    itemIds: look.itemIds ?? look.items.map((i) => i.id),
    items: look.items ?? [],
    note: Array.isArray(look.explanation) ? look.explanation.join(' ') : '',
    explanation: Array.isArray(look.explanation) ? look.explanation : [],
    score: look.score ?? null,
    breakdown: look.breakdown,
    pieceScores: look.pieceScores,
    feedback: look.feedback ?? null,
    rating: look.rating ?? null,
    incomplete: Boolean(look.incomplete),
    missingItemIds: look.missingItemIds,
    weather: look.weather ?? {},
    source: 'server',
  }))
}

export function useLooks() {
  const { user } = useAuth()
  const { items } = useWardrobe()
  const [looks, setLooks] = useState<HistoryLook[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!user) {
        if (cancelled) return
        setLooks([])
        setStatus('ready')
        return
      }
      const local = localToLooks(user.id, items)
      if (cancelled) return
      setLooks(local)

      // No token → offline session; local cache is all there is.
      if (!getApiToken()) {
        setStatus('ready')
        return
      }
      setStatus('loading')
      try {
        const rows = await listLooks()
        if (cancelled) return
        setLooks(serverToLooks(rows))
        setStatus('ready')
      } catch {
        if (cancelled) return
        setLooks(local)
        setStatus(local.length ? 'ready' : 'error')
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [user, items, reloadKey])

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  const save = useCallback(
    async (look: Partial<GeneratedLook>) => {
      const persisted = await saveLook(look)
      reload()
      return persisted
    },
    [reload],
  )

  const remove = useCallback(
    async (lookId: string) => {
      await deleteLook(lookId)
      setLooks((prev) => prev.filter((l) => l.id !== lookId))
      reload()
    },
    [reload],
  )

  const rate = useCallback(
    async (lookId: string, feedback: { feedback?: 'like' | 'dislike' | null; rating?: number | null }) => {
      await updateLookFeedback(lookId, feedback)
      setLooks((prev) =>
        prev.map((l) => {
          if (l.id !== lookId) return l
          return {
            ...l,
            feedback: feedback.feedback !== undefined ? feedback.feedback : l.feedback,
            rating: feedback.rating !== undefined ? feedback.rating : l.rating,
          }
        }),
      )
    },
    [],
  )

  return { looks, status, reload, save, remove, rate }
}