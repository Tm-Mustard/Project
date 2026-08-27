import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Home() {
  const { session } = useAuth()

  return (
    <section className="rounded-2xl border border-line bg-card p-8 shadow-sm">
      <p className="text-sm font-medium uppercase tracking-wide text-accent">
        Public
      </p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">
        See your account clearly.
      </h1>
      <p className="mt-4 max-w-lg text-muted">
        OpenLens is a small React app with email signup and login through
        Supabase. The dashboard is private; your profile row lives in the
        database.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        {session ? (
          <Link
            to="/dashboard"
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Go to dashboard
          </Link>
        ) : (
          <>
            <Link
              to="/signup"
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Create an account
            </Link>
            <Link
              to="/login"
              className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium hover:bg-paper"
            >
              Log in
            </Link>
          </>
        )}
      </div>
    </section>
  )
}
