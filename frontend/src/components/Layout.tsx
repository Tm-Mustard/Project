import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEffect, useState } from 'react'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
    isActive
      ? 'bg-accent/10 text-accent'
      : 'text-ink/70 hover:bg-line/40 hover:text-ink'
  }`

const TEAM = [
  {
    name: 'Aman Dwivedi',
    github: 'https://github.com/amandwivedi10000',
  },
  {
    name: 'Joel Dsouza',
    github: 'https://github.com/BloodBezerk',
  },
  {
    name: 'Sahil Paul',
    github: 'https://github.com/NOTE46',
  },
  {
    name: 'Falguni Yadav',
    github: 'https://github.com/codebyfalguni',
  },
]

export function Layout({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8)
      setShowBackToTop(window.scrollY > 480)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="relative flex min-h-svh flex-col">
      <div id="page-top" />
      <header
        className={`sticky top-0 z-50 border-b transition-all duration-300 ${
          scrolled
            ? 'border-line/70 bg-paper/90 shadow-sm backdrop-blur-lg'
            : 'border-transparent bg-paper/70 backdrop-blur-md'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <Link
            to="/"
            onClick={() => document.getElementById('page-top')?.scrollIntoView({ behavior: 'smooth' })}
            className="group flex items-center gap-2.5 text-lg font-semibold tracking-tight"
          >
            <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-accent text-white shadow-md shadow-accent/30 transition duration-300 group-hover:scale-105 group-hover:shadow-accent/50">
              <span className="absolute inset-0 -translate-x-full bg-white/20 transition duration-500 group-hover:translate-x-full" />
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="relative z-10"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            </span>
            <span>
              Open<span className="text-accent">Lens</span>
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink
              to="/"
              end
              onClick={() => document.getElementById('page-top')?.scrollIntoView({ behavior: 'smooth' })}
              className={linkClass}
            >
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
                <NavLink
                  to="/signup"
                  className="ml-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm shadow-accent/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-accent/40"
                >
                  Sign up
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 pb-8 pt-3 sm:px-6 lg:px-8">
        <main className="flex-1">{children}</main>

        <footer className="mt-20 border-t border-line pt-12 pb-8">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <Link
                to="/"
                className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                  </svg>
                </span>
                <span className="whitespace-nowrap">
                  Open<span className="text-accent">Lens</span>
                </span>
              </Link>

              <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
                Image-to-text powered by Gemini, Qwen & Nemotron. Multilingual.
                Built with care by Team Mustard.
              </p>

              <a
                href="https://github.com/Tm-Mustard/openlens.git"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-2 rounded-lg border border-line bg-card px-3.5 py-2 text-sm font-medium text-ink/80 transition hover:border-accent/40 hover:bg-paper hover:text-ink"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                View on GitHub
              </a>
            </div>

            <div>
              <h4 className="text-sm font-semibold tracking-wide text-ink">Product</h4>
              <ul className="mt-4 space-y-2.5 text-sm text-muted">
                <li>
                  <Link
                    to="/"
                    onClick={() => document.getElementById('page-top')?.scrollIntoView({ behavior: 'smooth' })}
                    className="transition hover:text-accent"
                  >
                    Home
                  </Link>
                </li>
                <li>
                  <Link
                    to={session ? '/dashboard' : '/signup'}
                    className="transition hover:text-accent"
                  >
                    {session ? 'Dashboard' : 'Get started'}
                  </Link>
                </li>
                <li>
                  <span className="cursor-default">Lens.ai Assistant</span>
                </li>
                <li>
                  <span className="cursor-default">50+ Languages</span>
                </li>
              </ul>

              <h4 className="mt-7 text-sm font-semibold tracking-wide text-ink">
                Models
              </h4>
              <ul className="mt-3 space-y-2.5 text-sm text-muted">
                <li>
                  <a
                    href="https://ai.google.dev/gemini-api/docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition hover:text-accent"
                  >
                    Gemini Docs →
                  </a>
                </li>
                <li>
                  <a
                    href="https://qwen.readthedocs.io/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition hover:text-accent"
                  >
                    Qwen Docs →
                  </a>
                </li>
                <li>
                  <a
                    href="https://docs.nvidia.com/nemotron/nightly/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition hover:text-accent"
                  >
                    Nemotron Docs →
                  </a>
                </li>
              </ul>
            </div>

            <div className="sm:col-span-2 lg:col-span-2">
              <h4 className="text-sm font-semibold tracking-wide text-ink">
                Built by Team Mustard
              </h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {TEAM.map((member) => (
                  <a
                    key={member.name}
                    href={member.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 rounded-xl border border-line bg-card/60 px-3.5 py-3 transition hover:border-accent/40 hover:bg-paper"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent transition group-hover:bg-accent group-hover:text-white">
                      {member.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink group-hover:text-accent">
                        {member.name}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-xs text-muted sm:flex-row">
            <p>
              © {new Date().getFullYear()} OpenLens · Built by{' '}
              <span className="font-medium text-ink/70">Team Mustard</span>
            </p>
            <p className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent/70" />
              Open source on{' '}
              <a
                href="https://github.com/Tm-Mustard/openlens.git"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-ink/70 underline-offset-2 hover:text-accent hover:underline"
              >
                GitHub
              </a>
            </p>
          </div>
        </footer>
      </div>

      <button
        onClick={() => document.getElementById('page-top')?.scrollIntoView({ behavior: 'smooth' })}
        aria-label="Back to top"
        className={`fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/30 transition-all duration-300 hover:-translate-y-1 hover:bg-accent-hover hover:shadow-accent/45 ${
          showBackToTop ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </div>
  )
}