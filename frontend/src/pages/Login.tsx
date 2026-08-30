import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Login() {
  const { signIn, configured } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mx-auto max-w-md rounded-2xl border border-line bg-card p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
      <p className="mt-2 text-sm text-muted">
        Use the email and password you signed up with.
      </p>
      <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-line bg-paper px-3 py-2 font-normal outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-line bg-paper px-3 py-2 font-normal outline-none focus:border-accent"
          />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {!configured ? (
          <p className="text-sm text-danger">
            Supabase env vars are missing. Copy .env.example to .env.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting || !configured}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60 cursor-pointer"
        >
          {submitting ? 'Signing in…' : 'Log in'}
        </button>
      </form>
      <p className="mt-6 text-sm text-muted">
        No account yet?{' '}
        <Link to="/signup" className="font-medium text-accent hover:underline cursor-pointer">
          Sign up
        </Link>
      </p>
    </section>
  )
}
