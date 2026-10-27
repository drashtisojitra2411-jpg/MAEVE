import { Menu } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { ThemeToggle } from '../ui/ThemeToggle'
import { useWeather } from '../../lib/weather-context'
import { formatTemperature } from '../../lib/weather'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/wardrobe': 'Wardrobe',
  '/add': 'Add to Wardrobe',
  '/stylist': 'Stylist',
  '/history': 'History',
  '/analytics': 'Insights',
  '/profile': 'Profile',
}

interface AppHeaderProps {
  onMenuOpen?: () => void
}

export function AppHeader({ onMenuOpen }: AppHeaderProps) {
  const { pathname } = useLocation()
  const weather = useWeather()
  const title = pageTitles[pathname] ?? 'MAEVE'
  const showLiveWeather = pathname === '/dashboard' && weather.status === 'ready' && weather.data

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-glass backdrop-blur-2xl">
      <div className="flex items-center justify-between px-6 py-4 lg:px-8">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onMenuOpen}
            className="flex h-8 w-8 items-center justify-center border border-line text-muted transition-colors hover:border-accent/50 hover:text-ink lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div>
            <h1 className="font-display text-2xl font-light text-ink">{title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-5">
          {showLiveWeather && weather.data && (
            <div className="hidden items-baseline gap-2 text-right md:flex">
              <span className="font-display text-2xl font-light text-ink leading-none">
                {formatTemperature(weather.data.current.temperature)}°
              </span>
              <span className="text-[9px] uppercase tracking-[0.2em] text-muted">
                {weather.data.current.condition}
              </span>
            </div>
          )}
          <div className="h-5 w-px bg-line" aria-hidden="true" />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}