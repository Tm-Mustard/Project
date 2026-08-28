import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function formatDate(value: string | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export function Dashboard() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function onSignOut() {
    await signOut()
    navigate('/', { replace: true })
  }
  const displayName =
  user?.user_metadata.full_name || user?.email?.split('@')[0] || 'there'

  return (
    <section className="rounded-2xl border border-line bg-card p-8 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-accent">
            Restricted
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Welcome, {displayName}.
          </h1>
          <p className="mt-2 text-muted">
            This page is only visible when you have a valid Supabase session.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onSignOut()}
          className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-paper"
        >
          Sign out
        </button>
      </div>

      <dl className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-paper px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            Email
          </dt>
          <dd className="mt-1 font-medium">{profile?.email ?? user?.email ?? '—'}</dd>
        </div>
        <div className="rounded-xl border border-line bg-paper px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            Full name
          </dt>
          <dd className="mt-1 font-medium">{displayName || '—'}</dd>
        </div>
        <div className="rounded-xl border border-line bg-paper px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            User id
          </dt>
          <dd className="mt-1 break-all font-mono text-sm">
            {profile?.id ?? user?.id ?? '—'}
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-paper px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            Profile created
          </dt>
          <dd className="mt-1 font-medium">{formatDate(profile?.created_at)}</dd>
        </div>
      </dl>
    </section>
  )
}
