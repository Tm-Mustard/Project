import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function ScreenMessage({ children }: { children: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-muted">
      {children}
    </div>
  )
}

export function ProtectedRoute() {
  const { session, loading, configured } = useAuth()

  if (!configured) {
    return (
      <ScreenMessage>
        Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env, then restart the
        dev server.
      </ScreenMessage>
    )
  }

  if (loading) {
    return <ScreenMessage>Loading session…</ScreenMessage>
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export function GuestRoute() {
  const { session, loading } = useAuth()

  if (loading) {
    return <ScreenMessage>Loading session…</ScreenMessage>
  }

  if (session) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
