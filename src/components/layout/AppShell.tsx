import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { AppHeader } from './AppHeader'
import { AppSidebar, AppMobileDrawer } from './AppSidebar'
import { PageLoader } from '../loading/PageLoader'

export function AppShell() {
  const location = useLocation()
  const reducedMotion = useReducedMotion()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [routeLoading, setRouteLoading] = useState(false)
  const previousPath = useRef(location.pathname)

  useEffect(() => {
    if (previousPath.current === location.pathname) return
    previousPath.current = location.pathname
    if (reducedMotion) return
    // oxlint-disable-next-line set-state-in-effect
    setRouteLoading(true)
    const timer = window.setTimeout(() => setRouteLoading(false), 520)
    return () => window.clearTimeout(timer)
  }, [location.pathname, reducedMotion])

  return (
    <div className="flex min-h-screen bg-bg">
      <AppSidebar />

      <div className="flex flex-1 flex-col">
        <AppHeader onMenuOpen={() => setMobileNavOpen(true)} />

        <AnimatePresence mode="wait">
          <motion.main
            key={location.pathname}
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1 overflow-y-auto"
          >
            <Outlet />
          </motion.main>
        </AnimatePresence>
      </div>

      {/* Mobile drawer — editorial sliding nav with icons */}
      <AnimatePresence>
        {mobileNavOpen && (
          <AppMobileDrawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        )}
      </AnimatePresence>

      <PageLoader visible={routeLoading} />
    </div>
  )
}