import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { Reveal } from '@/components/ui/Reveal'
import type { Persona, PersonaProfile } from '@/lib/auth'

/**
 * The "coding-personality" panel — a Spotify-Wrapped style read on the user's
 * archetype mix. The backend scores every developer as a *blend*, so we headline
 * the dominant persona with a glowing emblem and then chart the full distribution.
 *
 * Each persona id maps to a hand-drawn, terminal-flavoured SVG emblem and a
 * theme colour so the section sits naturally inside the CRT/phosphor dashboard.
 */

// ── per-persona styling ──────────────────────────────────────────────────────

interface PersonaArt {
  /** A CSS colour token from the terminal palette. */
  color: string
  /** Inline SVG glyph drawn in a 32×32 viewBox (stroke = currentColor). */
  emblem: ReactNode
}

/** 32×32 stroked glyph helper props (matches the phosphor line-art look). */
const G = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** Distinct colour + emblem for each persona archetype. */
const PERSONA_ART: Record<string, PersonaArt> = {
  architect: {
    color: 'var(--color-term-blue)',
    emblem: (
      <g {...G}>
        <path d="M16 3 4 9v14h24V9z" />
        <path d="M16 3v20M4 9l12 6 12-6M10 13.5v9M22 13.5v9" />
      </g>
    ),
  },
  'problem-solver': {
    color: 'var(--color-term-green)',
    emblem: (
      <g {...G}>
        <path d="M6 6h20v16H6z" />
        <path d="M11 12l-3 4 3 4M21 12l3 4-3 4M18 10l-4 12" />
      </g>
    ),
  },
  'vibe-coder': {
    color: 'var(--color-term-magenta)',
    emblem: (
      <g {...G}>
        <path d="M4 20c3-6 5-6 8 0s5 6 8 0 5-6 8 0" />
        <path d="M16 4v6M13 7l3-3 3 3" />
      </g>
    ),
  },
  'ui-artisan': {
    color: 'var(--color-term-cyan)',
    emblem: (
      <g {...G}>
        <path d="M5 6h22v14H5z" />
        <path d="M5 11h22M9 8.5h.01M12 8.5h.01M15 8.5h.01" />
        <path d="M11 15.5h10M11 18h6" />
      </g>
    ),
  },
  'devops-whisperer': {
    color: 'var(--color-term-amber)',
    emblem: (
      <g {...G}>
        <circle cx="16" cy="16" r="4" />
        <path d="M16 4v3M16 25v3M4 16h3M25 16h3M7.5 7.5l2.1 2.1M22.4 22.4l2.1 2.1M24.5 7.5l-2.1 2.1M9.6 22.4l-2.1 2.1" />
      </g>
    ),
  },
  'test-guardian': {
    color: 'var(--color-term-green-bright)',
    emblem: (
      <g {...G}>
        <path d="M16 3 6 7v7c0 6 4 10 10 12 6-2 10-6 10-12V7z" />
        <path d="M11 15.5l3.5 3.5L22 11.5" />
      </g>
    ),
  },
  'polyglot-explorer': {
    color: 'var(--color-term-purple)',
    emblem: (
      <g {...G}>
        <circle cx="16" cy="16" r="12" />
        <path d="M4 16h24M16 4c4 4 4 20 0 24M16 4c-4 4-4 20 0 24" />
      </g>
    ),
  },
  'open-source-citizen': {
    color: 'var(--color-term-cyan)',
    emblem: (
      <g {...G}>
        <circle cx="9" cy="9" r="3" />
        <circle cx="9" cy="23" r="3" />
        <circle cx="23" cy="14" r="3" />
        <path d="M9 12v11M9 11.5c0 6 4 2.5 11 2.5" />
      </g>
    ),
  },
  'refactoring-monk': {
    color: 'var(--color-term-yellow)',
    emblem: (
      <g {...G}>
        <path d="M22 5l5 5-13 13-6 1 1-6z" />
        <path d="M19 8l5 5M5 27h10" />
      </g>
    ),
  },
  'library-builder': {
    color: 'var(--color-term-blue)',
    emblem: (
      <g {...G}>
        <path d="M6 5h6v22H6zM14 5h6v22h-6z" />
        <path d="M21 6l5 1-3 21-5-1z" />
        <path d="M9 10h.01M17 10h.01" />
      </g>
    ),
  },
}

const FALLBACK_ART: PersonaArt = {
  color: 'var(--color-term-muted)',
  emblem: (
    <g {...G}>
      <circle cx="16" cy="12" r="5" />
      <path d="M7 27c1.5-5 4.5-7 9-7s7.5 2 9 7" />
    </g>
  ),
}

const artFor = (id: string): PersonaArt => PERSONA_ART[id] ?? FALLBACK_ART

// ── emblem badge ─────────────────────────────────────────────────────────────

/** A persona's glyph inside a glowing hex/coin badge, tinted to its colour. */
function PersonaEmblem({ persona, size = 88 }: { persona: Persona; size?: number }) {
  const { color, emblem } = artFor(persona.id)
  return (
    <span
      className="relative grid shrink-0 place-items-center rounded-full"
      style={{
        height: size,
        width: size,
        color,
        background: `radial-gradient(circle at 50% 35%, color-mix(in srgb, ${color} 22%, transparent), transparent 70%)`,
        boxShadow: `0 0 28px -8px ${color}, inset 0 0 0 1px color-mix(in srgb, ${color} 45%, transparent)`,
      }}
    >
      {/* rotating dashed ring for a little "achievement medal" life */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full animate-[spin_18s_linear_infinite] opacity-50 motion-reduce:animate-none"
        aria-hidden
      >
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="3 7"
        />
      </svg>
      <svg viewBox="0 0 32 32" width={size * 0.5} height={size * 0.5} aria-hidden>
        {emblem}
      </svg>
    </span>
  )
}

// ── primary persona hero ─────────────────────────────────────────────────────

function PrimaryPersona({ persona }: { persona: Persona }) {
  const { color } = artFor(persona.id)
  return (
    <div
      className="relative overflow-hidden rounded-lg border p-4 sm:p-5"
      style={{
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        background: `linear-gradient(135deg, color-mix(in srgb, ${color} 10%, transparent), transparent 60%)`,
      }}
    >
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <PersonaEmblem persona={persona} />
        <div className="min-w-0">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-term-dim">
            // your primary archetype
          </p>
          <h3
            className="font-display text-2xl leading-tight sm:text-3xl"
            style={{ color }}
          >
            {persona.label}
          </h3>
          <p className="mt-1 text-sm italic text-term-muted">&ldquo;{persona.tagline}&rdquo;</p>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-term-fg">
            {persona.description}
          </p>
          <div className="mt-3 inline-flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 font-mono text-xs"
              style={{
                color,
                background: `color-mix(in srgb, ${color} 14%, transparent)`,
              }}
            >
              {persona.score}% of your mix
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── distribution row ─────────────────────────────────────────────────────────

/** One archetype in the blend: emblem, name, tagline, and a share bar. */
function PersonaRow({ persona, rank }: { persona: Persona; rank: number }) {
  const { color, emblem } = artFor(persona.id)
  const pct = Math.max(2, Math.round(persona.share * 100))
  return (
    <li
      className="flex animate-rise items-center gap-3 rounded-md border border-term-border bg-term-bg/30 p-2.5"
      style={{ animationDelay: `${rank * 60}ms` }}
    >
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-md"
        style={{
          color,
          background: `color-mix(in srgb, ${color} 14%, transparent)`,
        }}
      >
        <svg viewBox="0 0 32 32" width={20} height={20} aria-hidden>
          {emblem}
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm text-term-fg">{persona.label}</span>
          <span className="shrink-0 font-mono text-xs text-term-muted">{persona.score}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-term-bg">
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
        <p className="mt-1 truncate text-xs italic text-term-dim">{persona.tagline}</p>
      </div>
    </li>
  )
}

// ── panel ────────────────────────────────────────────────────────────────────

/**
 * The full persona section. Headlines the dominant archetype, then shows the
 * rest of the blend (collapsed to the top few, expandable to the whole catalogue).
 */
export function PersonaPanel({ profile }: { profile: PersonaProfile }) {
  const [expanded, setExpanded] = useState(false)

  // Only personas that actually scored, strongest first (backend already sorts).
  const scored = useMemo(
    () => profile.personas.filter((p) => p.share > 0),
    [profile.personas],
  )
  const primary = useMemo(
    () => scored.find((p) => p.id === profile.primary) ?? scored[0],
    [scored, profile.primary],
  )

  if (!primary) return null

  // The blend below the hero: everything except the primary.
  const rest = scored.filter((p) => p.id !== primary.id)
  const shown = expanded ? rest : rest.slice(0, 3)

  return (
    <Reveal from="up">
      <section className="rounded-lg border border-term-border bg-term-surface/50 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-mono text-sm text-term-fg">// coding personality</h2>
          <span className="font-mono text-xs text-term-dim">
            you&apos;re a blend of {scored.length} archetype{scored.length === 1 ? '' : 's'}
          </span>
        </div>

        <PrimaryPersona persona={primary} />

        {rest.length > 0 && (
          <>
            <p className="mb-2 mt-4 font-mono text-xs text-term-dim">// the rest of your blend</p>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {shown.map((p, i) => (
                <PersonaRow key={p.id} persona={p} rank={i} />
              ))}
            </ul>
            {rest.length > 3 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-3 font-mono text-xs text-term-muted underline-offset-2 transition-colors hover:text-accent hover:underline"
              >
                {expanded ? '› show fewer' : `› show all ${rest.length} archetypes`}
              </button>
            )}
          </>
        )}

        <p className="mt-4 text-xs text-term-dim">
          // derived from your skills, language mix &amp; repo activity — no commit history yet
        </p>
      </section>
    </Reveal>
  )
}
