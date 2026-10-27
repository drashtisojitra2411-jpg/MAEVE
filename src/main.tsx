import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthProvider } from './lib/auth'
import { WardrobeProvider } from './lib/wardrobe-context'
import { ThemeProvider } from './lib/theme'
import { WeatherProvider } from './lib/weather-context'
import './styles/globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <WeatherProvider>
        <AuthProvider>
          <WardrobeProvider>
            <App />
          </WardrobeProvider>
        </AuthProvider>
      </WeatherProvider>
    </ThemeProvider>
  </StrictMode>,
)