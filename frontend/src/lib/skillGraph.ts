/**
 * skillGraph.ts
 *
 * Projects the real analysis output onto the canonical skill graph so the
 * skill-tree viz can render it.
 *
 * The graph (nodes + prerequisite edges + domains/tracks) is the single source
 * of truth, authored in `backend/app/skills/taxonomy.yaml` and exported to
 * `@/data/taxonomy.json` via `python -m app.skills.export`. The detection
 * pipeline produces a flat `SkillAnalysis` (no hierarchy); here we marry the two
 * into a single-rooted dependency tree:
 *
 *   - one synthetic root ("core") is the single starting point;
 *   - every skill's depth comes from the prerequisite DAG (longest path), so
 *     foundations sit at the top and advanced skills flow down;
 *   - each skill's tree-parent is its deepest prerequisite (or the root), giving
 *     clean one-level edges the layout can order by dependency;
 *   - nodes are lit when the analysis demonstrated them, dimmed otherwise.
 *
 * Colour comes from the skill's `domain`; the legacy four-way `category` is kept
 * only as a fallback for the mock demo.
 */

import type { Skill } from '@/types/api'
import type { Skill as AnalysisSkill, SkillAnalysis, SkillLevel } from '@/lib/auth'
import taxonomyJson from '@/data/taxonomy.json'

// ── shape of the exported taxonomy.json (mirrors the backend pydantic models) ─
interface TaxSkill {
  id: string
  name: string
  kind: 'hard' | 'concept'
  domain: string
  summary: string
  graph: { requires: string[]; tier: number }
  tracks: Record<string, number>
}
interface TaxDomain {
  id: string
  label: string
  color: string
  icon: string
}
interface TaxTrack {
  id: string
  label: string
  color: string
  icon: string
  blurb: string
}
interface TaxonomyGraph {
  version: string
  tracks: TaxTrack[]
  domains: TaxDomain[]
  skills: TaxSkill[]
}

const TAXONOMY = taxonomyJson as unknown as TaxonomyGraph
const ROOT_ID = '__root'

// ── small lookups ────────────────────────────────────────────────────────────

/** Palette name (stored in the taxonomy) → a concrete theme colour. */
const PALETTE: Record<string, string> = {
  cyan: 'var(--color-term-cyan)',
  magenta: 'var(--color-term-magenta)',
  green: 'var(--color-term-green)',
  amber: 'var(--color-term-amber)',
  red: 'var(--color-term-red)',
  purple: 'var(--color-term-purple)',
  blue: '#4ea1ff',
  accent: 'var(--accent)',
}
const paletteColor = (name: string): string => PALETTE[name] ?? 'var(--accent)'

/** Map a fine-grained domain onto one of the viz's four legacy categories. */
const DOMAIN_CATEGORY: Record<string, Skill['category']> = {
  languages: 'Languages',
  paradigms: 'Paradigms',
  frameworks: 'Tooling & DevOps',
  architecture: 'Paradigms',
  'build-tooling': 'Tooling & DevOps',
  data: 'Tooling & DevOps',
  quality: 'Code Quality',
  infrastructure: 'Tooling & DevOps',
}
const domainCategory = (d: string): Skill['category'] => DOMAIN_CATEGORY[d] ?? 'Paradigms'

const LEVEL_NUM: Record<SkillLevel, number> = {
  none: 0,
  basic: 1,
  intermediate: 2,
  advanced: 3,
}
const levelFromScore = (score: number): number =>
  score >= 67 ? 3 : score >= 34 ? 2 : score > 0 ? 1 : 0

/**
 * Detection ids that don't match a taxonomy id 1:1. The analysis pipeline now
 * emits real `javascript` / `typescript` / `python` / `html-css` language skills
 * that map straight onto taxonomy nodes, so no aliases are needed today. (`typing`
 * stays its own concept and `iac` / `architecture` have no single taxonomy target,
 * so all three are simply left unmapped and ignored by the tree.)
 */
const SKILL_ALIASES: Record<string, string> = {}

const domainColorOf = (id: string): string =>
  TAXONOMY.domains.find((d) => d.id === id)?.color ?? 'accent'

/** Longest-path depth of every skill in the prerequisite DAG (0 = no prereqs). */
function computeLevels(skills: TaxSkill[]): Map<string, number> {
  const byId = new Map(skills.map((s) => [s.id, s]))
  const memo = new Map<string, number>()
  const depth = (id: string): number => {
    const cached = memo.get(id)
    if (cached !== undefined) return cached
    const skill = byId.get(id)
    const reqs = (skill?.graph.requires ?? []).filter((r) => byId.has(r))
    const value = reqs.length === 0 ? 0 : 1 + Math.max(...reqs.map(depth))
    memo.set(id, value)
    return value
  }
  skills.forEach((s) => depth(s.id))
  return memo
}

/**
 * The tree-parent for a skill: its deepest prerequisite (so the edge spans
 * exactly one level), tie-broken by id. Skills with no prerequisite hang off
 * the synthetic root.
 */
function primaryParent(skill: TaxSkill, levels: Map<string, number>): string {
  const reqs = skill.graph.requires.filter((r) => levels.has(r))
  if (reqs.length === 0) return ROOT_ID
  reqs.sort((a, b) => {
    const la = levels.get(a)!
    const lb = levels.get(b)!
    if (lb !== la) return lb - la
    return a < b ? -1 : 1
  })
  return reqs[0]
}

// ── public API ───────────────────────────────────────────────────────────────

/** Minimum track-affinity for a skill to count as part of a career track. */
export const TRACK_AFFINITY_THRESHOLD = 0.4

/** A career track the user can focus their skill tree on. */
export interface SkillTrack {
  id: string
  label: string
  color: string
  icon: string
  blurb: string
}

/** The career tracks defined by the taxonomy, with palette colours resolved. */
export function listTracks(): SkillTrack[] {
  return TAXONOMY.tracks.map((t) => ({ ...t, color: paletteColor(t.color) }))
}

/** Taxonomy skill ids that belong to a track (affinity ≥ `threshold`). */
export function trackSkillIds(
  trackId: string,
  threshold = TRACK_AFFINITY_THRESHOLD,
): Set<string> {
  const ids = new Set<string>()
  for (const s of TAXONOMY.skills) {
    if ((s.tracks?.[trackId] ?? 0) >= threshold) ids.add(s.id)
  }
  return ids
}

/**
 * Build the skill-tree nodes for the viz from a detection result. Pass `null`
 * to get the full taxonomy with every node locked (a "what you could learn" map).
 * Pass a `trackId` to focus the tree on one career track's skills only.
 *
 * The first node is always the synthetic root. Every node carries a `tier`
 * (its row in the dependency layering) which the layout uses to place it.
 */
export function projectSkillTree(
  analysis: SkillAnalysis | null,
  trackId?: string | null,
): Skill[] {
  // When a track is chosen, narrow the taxonomy to that track's skills so the
  // tree stays a focused path rather than the full (large) graph.
  const inTrack = trackId ? trackSkillIds(trackId) : null
  const skills = inTrack ? TAXONOMY.skills.filter((s) => inTrack.has(s.id)) : TAXONOMY.skills

  // Index detected skills by their taxonomy id (after alias normalisation).
  const detected = new Map<string, AnalysisSkill>()
  if (analysis) {
    for (const rec of Object.values(analysis.skillset)) {
      detected.set(SKILL_ALIASES[rec.skillId] ?? rec.skillId, rec)
    }
  }

  // The recommendation engine returns the user's demonstrated skills as a small
  // {name, strength} graph. When present we let it drive each node's XP so the
  // tree reflects Michael's agent output; we fall back to the detector's score
  // for any lit node it doesn't cover (and if the engine produced nothing).
  const userStrength = new Map<string, number>()
  for (const node of analysis?.userSkillTree ?? []) {
    userStrength.set(node.name, node.strength)
  }

  // "Programming Basics" is foundational and isn't emitted by the detector — if
  // the user has any analysed source (or any demonstrated skill), they can code.
  const overall = analysis?.overallScore ?? 0
  const canCode =
    !!analysis &&
    (analysis.stats.reposWithSource > 0 ||
      Object.values(analysis.skillset).some((s) => s.present))

  const levels = computeLevels(skills)

  const present = (s: TaxSkill): boolean =>
    s.id === 'programming' ? canCode : !!detected.get(s.id)?.present

  const demonstrated = skills.filter(present).length

  const root: Skill = {
    id: ROOT_ID,
    name: 'core',
    category: 'Code Quality',
    color: 'var(--accent)',
    xp: Math.round(overall),
    level: demonstrated,
    parent_id: null,
    description: `${demonstrated} of ${skills.length} skills demonstrated across your repositories — the foundation of your profile.`,
    locked: demonstrated === 0,
    tier: 0,
  }

  const skillNodes: Skill[] = skills
    .map((s): Skill => {
      const isProgramming = s.id === 'programming'
      const rec = detected.get(s.id)
      const lit = present(s)
      // Prefer the recommendation engine's strength (0..1) for XP when it has an
      // entry for this skill; otherwise use the detector's 0..100 score.
      const engineStrength = userStrength.get(s.id)
      const hasEngine = engineStrength !== undefined
      const score = isProgramming
        ? overall
        : hasEngine
          ? Math.round(engineStrength * 100)
          : (rec?.score ?? 0)
      const lvl = isProgramming
        ? levelFromScore(overall)
        : hasEngine
          ? levelFromScore(Math.round(engineStrength * 100))
          : rec
            ? LEVEL_NUM[rec.level]
            : 0
      const evidence = (rec?.evidence ?? [])
        .slice(0, 4)
        .map((e) => `${e.repo}: ${e.observation}`)
      return {
        id: s.id,
        name: s.name,
        category: domainCategory(s.domain),
        color: paletteColor(domainColorOf(s.domain)),
        xp: lit ? Math.round(score) : 0,
        level: lit ? lvl : 0,
        parent_id: primaryParent(s, levels),
        evidence,
        description: s.summary,
        locked: !lit,
        tier: (levels.get(s.id) ?? 0) + 1,
      }
    })
    // Group siblings (same parent) adjacently for a stable starting order.
    .sort((a, b) => {
      const pa = a.parent_id ?? ''
      const pb = b.parent_id ?? ''
      if (pa !== pb) return pa < pb ? -1 : 1
      return a.id < b.id ? -1 : 1
    })

  return [root, ...skillNodes]
}

/** Headline counts for the skill-tree panel. */
export function skillTreeSummary(
  analysis: SkillAnalysis | null,
  trackId?: string | null,
): { present: number; total: number; version: string } {
  const nodes = projectSkillTree(analysis, trackId).filter((n) => n.id !== ROOT_ID)
  return {
    present: nodes.filter((n) => !n.locked).length,
    total: nodes.length,
    version: TAXONOMY.version,
  }
}
