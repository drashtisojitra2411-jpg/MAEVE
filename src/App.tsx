import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute, PublicOnlyRoute } from './components/auth/RouteGuards'
import { AppShell } from './components/layout/AppShell'

const LandingPage = lazy(() => import('./pages/LandingPage').then((m) => ({ default: m.LandingPage })))
const HowItHelpsPage = lazy(() => import('./pages/HowItHelpsPage').then((m) => ({ default: m.HowItHelpsPage })))
const SignInPage = lazy(() => import('./pages/SignInPage').then((m) => ({ default: m.SignInPage })))
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const WardrobePage = lazy(() => import('./pages/WardrobePage').then((m) => ({ default: m.WardrobePage })))
const AddToWardrobePage = lazy(() => import('./pages/AddToWardrobePage').then((m) => ({ default: m.AddToWardrobePage })))
const StylistPage = lazy(() => import('./pages/StylistPage').then((m) => ({ default: m.StylistPage })))
const HistoryPage = lazy(() => import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
      <div className="w-7 h-7 rounded-full border-2 border-stone-300 border-t-stone-800 animate-spin dark:border-stone-700 dark:border-t-stone-200" />
      <span className="font-serif italic text-xs tracking-widest uppercase text-stone-500">MAEVE</span>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/how-it-helps" element={<HowItHelpsPage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/wardrobe" element={<WardrobePage />} />
              <Route path="/add" element={<AddToWardrobePage />} />
              <Route path="/stylist" element={<StylistPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
      <div className="grain-overlay" aria-hidden="true" />
    </BrowserRouter>
  )
}