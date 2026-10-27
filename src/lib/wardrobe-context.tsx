import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { WardrobeItem } from '../types'
import { useAuth } from './auth'
import { getApiToken } from '../services/apiClient'
import { readWardrobe, removeFromWardrobe, writeWardrobe } from '../services/wardrobeService'
import {
  deleteRemoteWardrobeItem,
  fetchWardrobeFromServer,
  pushWardrobeToServer,
  updateRemoteWardrobeItem,
} from '../services/wardrobeApi'

interface WardrobeContextValue {
  status: 'loading' | 'ready' | 'error'
  /** Where the shown pieces came from: the server, or the local cache. */
  source: 'server' | 'local'
  items: WardrobeItem[]
  addItems: (items: WardrobeItem[]) => void
  updateItem: (item: WardrobeItem) => void
  removeItem: (itemId: string) => void
  /** Re-read the backend; keep the local cache when it is unreachable. */
  refresh: () => void
}

const WardrobeContext = createContext<WardrobeContextValue | undefined>(undefined)

export function WardrobeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [source, setSource] = useState<'server' | 'local'>('local')
  const [bootVersion, setBootVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(async () => {
      if (cancelled) return
      if (!userId) {
        setItems([])
        setSource('local')
        setStatus('ready')
        return
      }

      // 1. Show the local cache immediately (offline-safe, no flash).
      const local = readWardrobe(userId)
      setItems(local)
      setSource('local')
      setStatus('ready')

      // 2. The backend is the source of truth when reachable. Without a
      // session token there is no backend to reach, so the local cache is
      // authoritative (an empty cache is honestly empty, not an error).
      if (!getApiToken()) return
      const server = await fetchWardrobeFromServer()
      if (cancelled) return
      if (server !== null) {
        setItems(server)
        writeWardrobe(userId, server)
        setSource('server')
        setStatus('ready')
      } else if (local.length === 0) {
        // Signed in, nothing cached, and the service is unreachable — an
        // honest error, not an invented "empty wardrobe".
        setStatus('error')
      }
    }, 260)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [userId, bootVersion])

  const addItems = useCallback(
    (newItems: WardrobeItem[]) => {
      if (!userId) return
      const stamped = newItems.map((item) => ({
        ...item,
        userId,
        timesWorn: item.timesWorn ?? 0,
        createdAt: item.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      }))
      // Deduplicate by ID so upload retries or repeated confirmations never create duplicates
      const map = new Map(items.map((i) => [i.id, i]))
      for (const item of stamped) {
        map.set(item.id, item)
      }
      const next = Array.from(map.values())
      writeWardrobe(userId, next)
      setItems(next)
      setStatus('ready')
      void pushWardrobeToServer(stamped)
    },
    [userId, items],
  )

  const updateItem = useCallback(
    (updated: WardrobeItem) => {
      if (!userId) return
      const stamped: WardrobeItem = {
        ...updated,
        userId,
        userCorrected: true,
        updatedAt: Date.now(),
      }
      const next = items.map((i) => (i.id === updated.id ? stamped : i))
      writeWardrobe(userId, next)
      setItems(next)
      void updateRemoteWardrobeItem(stamped)
    },
    [userId, items],
  )

  const removeItem = useCallback(
    (itemId: string) => {
      if (!userId) return
      const next = removeFromWardrobe(userId, itemId)
      setItems(next)
      setStatus('ready')
      void deleteRemoteWardrobeItem(itemId)
    },
    [userId],
  )

  const refresh = useCallback(() => setBootVersion((v) => v + 1), [])

  const value = useMemo(
    () => ({ status, source, items, addItems, updateItem, removeItem, refresh }),
    [status, source, items, addItems, updateItem, removeItem, refresh],
  )

  return <WardrobeContext.Provider value={value}>{children}</WardrobeContext.Provider>
}

export function useWardrobe(): WardrobeContextValue {
  const context = useContext(WardrobeContext)
  if (!context) {
    throw new Error('useWardrobe must be used within WardrobeProvider')
  }
  return context
}