import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { NameGate } from './components/NameGate'
import { SettingsPanel } from './components/SettingsPanel'
import { UpdateBanner } from './components/UpdateBanner'
import { OwlLogo } from './components/OwlLogo'
import { Button, ErrorNote, Spinner } from './components/ui'
import { AppProvider, useApp } from './context/AppContext'
import { isConfigured } from './lib/supabase'
import { BookmarksPage } from './pages/Bookmarks'
import { HangoutPage } from './pages/Hangout'
import { HomePage } from './pages/Home'
import { JoinPage } from './pages/Join'
import { NotConfigured } from './pages/NotConfigured'

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg">
      <OwlLogo size={72} className="animate-pulse" />
      <Spinner />
    </div>
  )
}

function Shell() {
  const { ready, bootError } = useApp()
  if (!ready) return <Splash />
  if (bootError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
        <div className="w-full max-w-md space-y-4 rounded-xl3 bg-surface p-8 shadow-pop">
          <OwlLogo size={48} />
          <h1 className="text-lg font-extrabold text-ink">Couldn't reach Supabase</h1>
          <p className="text-sm text-muted">
            This is usually a brief hiccup. Try again in a moment.
          </p>
          <ErrorNote message={bootError} />
          <Button full onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </div>
    )
  }
  return (
    <>
      <Routes>
        <Route path="/join/:code" element={<JoinPage />} />
        <Route
          element={
            <Layout>
              <Outlet />
            </Layout>
          }
        >
          <Route path="/" element={<HomePage />} />
          <Route path="/bookmarks" element={<BookmarksPage />} />
          <Route path="/hangout/:id" element={<HangoutPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <NameGate />
      <SettingsPanel />
      <UpdateBanner />
    </>
  )
}

export default function App() {
  if (!isConfigured) return <NotConfigured />
  return (
    <BrowserRouter>
      <AppProvider>
        <Shell />
      </AppProvider>
    </BrowserRouter>
  )
}
