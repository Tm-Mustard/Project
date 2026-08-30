import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEffect, useState } from 'react'

const LANGUAGES = [
  'English', 'Español', 'हिन्दी', '中文', '日本語', 'Français',
  'Deutsch', 'العربية', 'Português', '한국어', 'Русский', 'Italiano',
  'ไทย', 'Türkçe', 'Nederlands', 'Polski'
]

export function Home() {
  const { session } = useAuth()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Slightly longer delay so the browser has painted once; avoids jank
    const t = setTimeout(() => setReady(true), 80)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="relative overflow-hidden">
      {/* ── Ambient background ── */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-56 left-1/2 h-[680px] w-[980px] -translate-x-1/2 rounded-full bg-accent/20 blur-[110px]" />
        <div className="absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-accent/12 blur-[90px]" />
        <div className="absolute top-1/4 -left-20 h-72 w-72 rounded-full bg-accent/8 blur-[70px]" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #1f6f5b 1px, transparent 1px), linear-gradient(to bottom, #1f6f5b 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      {/* ── Hero ── */}
      <section className="mx-auto max-w-5xl px-4 pb-6 sm:px-6 lg:px-8">
        <div
          className={`mx-auto max-w-3xl text-center transition-all duration-700 ease-out ${
            ready ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          {/* Live badge */}
          <div className="inline-flex items-center gap-2.5 rounded-full border border-line bg-card/90 px-4 py-1.5 text-xs font-medium text-muted shadow-sm backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            Image → Text • Multilingual • 3 AI models
          </div>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.5rem] lg:leading-[1.08]">
            Turn any image into
            <span className="mt-1.5 block bg-gradient-to-r from-accent via-[#2a8f74] to-accent/70 bg-clip-text pb-1 text-transparent">
              clean, usable text
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            OpenLens extracts text from screenshots, photos and documents in{' '}
            <span className="font-medium text-ink">dozens of languages</span>.
            Choose Gemini, Qwen or Nemotron — then ask{' '}
            <span className="font-medium text-ink">Lens.ai</span> anything
            about what you just extracted.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {session ? (
              <Link
                to="/dashboard"
                className="group relative inline-flex items-center justify-center overflow-hidden rounded-xl bg-accent px-7 py-3.5 text-sm font-medium text-white shadow-lg shadow-accent/30 transition-all duration-300 hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-accent/45"
              >
                <span className="relative z-10 flex items-center gap-2">
                  Go to dashboard
                  <svg className="h-4 w-4 transition group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </span>
                <span className="absolute inset-0 -translate-x-full bg-white/20 transition duration-500 group-hover:translate-x-0" />
              </Link>
            ) : (
              <>
                <Link
                  to="/signup"
                  className="group relative inline-flex items-center justify-center overflow-hidden rounded-xl bg-accent px-7 py-3.5 text-sm font-medium text-white shadow-lg shadow-accent/30 transition-all duration-300 hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-accent/45"
                >
                  <span className="relative z-10">Create free account</span>
                  <span className="absolute inset-0 -translate-x-full bg-white/20 transition duration-500 group-hover:translate-x-0" />
                </Link>
                <Link
                  to="/login"
                  className="rounded-xl border border-line bg-card/80 px-7 py-3.5 text-sm font-medium backdrop-blur transition hover:border-accent/40 hover:bg-paper"
                >
                  Log in
                </Link>
              </>
            )}
          </div>
        </div>

        {/* ── Language ticker ── */}
        <div
          className={`relative mx-auto mt-10 max-w-3xl overflow-hidden rounded-2xl border border-line/70 bg-card/60 py-3 backdrop-blur transition-all duration-700 delay-100 ${
            ready ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
          }`}
        >
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-card to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-card to-transparent" />

          <div className="group flex animate-marquee whitespace-nowrap hover:[animation-play-state:paused]">
            {[...LANGUAGES, ...LANGUAGES].map((lang, i) => (
              <span
                key={i}
                className="mx-5 inline-flex items-center gap-2 text-sm font-medium text-muted"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-accent/70" />
                {lang}
              </span>
            ))}
          </div>
        </div>

        {/* ── Model pills ── */}
        <div
          className={`mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-3 transition-all duration-700 delay-200 ease-out ${
            ready ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
          }`}
        >
          {[
            { name: 'Gemini', desc: 'Fast & balanced' },
            { name: 'Qwen', desc: 'Documents & tables' },
            { name: 'Nemotron', desc: 'Deep reasoning' },
          ].map((m) => (
            <div
              key={m.name}
              className="group flex items-center gap-2.5 rounded-2xl border border-line bg-card/90 px-4 py-2.5 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-accent/30 hover:shadow-md"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent transition group-hover:scale-110">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold leading-none">{m.name}</div>
                <div className="mt-0.5 text-[11px] text-muted">{m.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature grid ── */}
      <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            visible={ready}
            delayMs={300}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M7 7h.01M17 7h.01M7 17h.01M17 17h.01M7 12h10" />
              </svg>
            }
            title="Image → Text"
            desc="Drop screenshots, photos, receipts or scanned pages. Get clean structured text in seconds."
            tags={['Screenshots', 'Handwriting', 'Docs']}
          />

          <FeatureCard
            visible={ready}
            delayMs={380}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 2v4M6.8 15l-3.5 2M20.7 17l-3.5-2M6.8 9 3.3 7M20.7 7l-3.5 2" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            }
            title="Three AI models"
            desc="Switch between Gemini, Qwen and Nemotron for the perfect mix of speed, accuracy and depth."
            tags={['Gemini', 'Qwen', 'Nemotron']}
          />

          <FeatureCard
            visible={ready}
            delayMs={460}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                <path d="M2 12h20" />
              </svg>
            }
            title="Multi-language"
            desc="Understands and extracts text in dozens of languages — from English and Hindi to Chinese, Arabic and more."
            tags={['50+ languages', 'RTL support']}
            highlight
          />

          <FeatureCard
            visible={ready}
            delayMs={540}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                <path d="M19 3v4M21 5h-4" />
              </svg>
            }
            title="Lens.ai assistant"
            desc="Chat with Lens.ai about the extracted text — summarise, translate, explain or pull specific fields."
            tags={['Summarise', 'Translate', 'Explain']}
          />
        </div>

        {/* ── Bottom CTA ── */}
        <div
          className={`relative mt-12 overflow-hidden rounded-2xl border border-line bg-card p-7 sm:p-9 transition-all duration-700 delay-500 ease-out ${
            ready ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />

          <div className="relative flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-xl font-semibold tracking-tight">
                Ready to extract your first image?
              </h3>
              <p className="mt-1.5 max-w-md text-sm text-muted">
                Works across languages. Sign up in seconds — your dashboard is private and your profile lives securely in the database.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              {session ? (
                <Link
                  to="/dashboard"
                  className="rounded-xl bg-accent px-6 py-3 text-sm font-medium text-white shadow-md shadow-accent/25 transition hover:bg-accent-hover"
                >
                  Open dashboard
                </Link>
              ) : (
                <>
                  <Link
                    to="/signup"
                    className="rounded-xl bg-accent px-6 py-3 text-sm font-medium text-white shadow-md shadow-accent/25 transition hover:bg-accent-hover"
                  >
                    Get started free
                  </Link>
                  <Link
                    to="/login"
                    className="rounded-xl border border-line px-6 py-3 text-sm font-medium transition hover:bg-paper"
                  >
                    I already have an account
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Styles ── */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 32s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-marquee {
            animation: none;
          }
        }
      `}</style>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  desc,
  tags,
  highlight = false,
  visible = true,
  delayMs = 0,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  tags: string[]
  highlight?: boolean
  visible?: boolean
  delayMs?: number
}) {
  return (
    <div
      style={{ transitionDelay: `${delayMs}ms` }}
      className={`group relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-all duration-700 ease-out hover:-translate-y-1.5 hover:shadow-lg will-change-transform ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      } ${
        highlight
          ? 'border-accent/50 ring-1 ring-accent/25 shadow-accent/10'
          : 'border-line'
      }`}
    >
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/0 blur-2xl transition-all duration-500 group-hover:bg-accent/20" />

      <div className="relative">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent transition duration-300 group-hover:scale-110 group-hover:bg-accent/15">
          {icon}
        </div>

        <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{desc}</p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-medium text-muted"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}