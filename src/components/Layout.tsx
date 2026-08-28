import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${
    isActive ? 'bg-accent text-white' : 'text-ink/80 hover:bg-line/60'
  }`

export function Layout({ children }: { children: ReactNode }) {
  const { session } = useAuth()

  return (
    <div className="mx-auto flex min-h-svh max-w-3xl flex-col px-5 py-6">
      <header className="mb-10 flex items-center justify-between gap-4">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          OpenLens
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={linkClass}>
            Home
          </NavLink>
          {session ? (
            <NavLink to="/dashboard" className={linkClass}>
              Dashboard
            </NavLink>
          ) : (
            <>
              <NavLink to="/login" className={linkClass}>
                Log in
              </NavLink>
              <NavLink to="/signup" className={linkClass}>
                Sign up
              </NavLink>
            </>
          )}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-16 border-t border-line pt-4 text-sm text-muted">
        Accounts are stored in Supabase Auth and the public profiles table.
      </footer>
    </div>
  )
}
