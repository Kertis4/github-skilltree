import type { IconName } from '@/components/ui/icons'

/** Where a node sits in the tree — controls size & how it renders. */
export type SkillKind = 'root' | 'category' | 'skill'

/** The four canonical branches (plus the profile root), mirrored from the README. */
export type SkillCategory = 'core' | 'languages' | 'paradigms' | 'tooling' | 'quality'

export interface SkillNode {
  id: string
  label: string
  kind: SkillKind
  category: SkillCategory
  /** Position in the SVG viewBox (0..720 x, 0..520 y). */
  x: number
  y: number
  level: number
  maxLevel: number
  /** XP into the current level / XP needed to reach the next. */
  xp: number
  xpNext: number
  /** Locked = not yet started; shown as an "expand here next" node. */
  locked?: boolean
  blurb: string
  /** Parent node id — used to draw the connecting edge. */
  parent?: string
}

/** Per-category identity: label, map colour (from the theme palette) and icon. */
export const CATEGORY_META: Record<
  SkillCategory,
  { label: string; color: string; icon: IconName }
> = {
  core: { label: 'Profile', color: 'var(--accent)', icon: 'tree' },
  languages: { label: 'Languages', color: 'var(--color-term-cyan)', icon: 'code' },
  paradigms: { label: 'Paradigms', color: 'var(--color-term-magenta)', icon: 'sparkles' },
  tooling: { label: 'Tooling', color: 'var(--color-term-amber)', icon: 'cpu' },
  quality: { label: 'Quality', color: 'var(--color-term-blue)', icon: 'shield' },
}

/**
 * A small, illustrative slice of the canonical skill tree. The real tree comes
 * from analysis; this is a fixed sample so the landing page can show the shape
 * of it — branches you can deepen and locked nodes you can expand into.
 */
export const skillNodes: SkillNode[] = [
  {
    id: 'dev',
    label: 'Developer',
    kind: 'root',
    category: 'core',
    x: 360,
    y: 260,
    level: 12,
    maxLevel: 20,
    xp: 4200,
    xpNext: 6000,
    blurb: 'Your overall profile — every branch below rolls up into this level and your radar shape.',
  },

  // --- Categories -----------------------------------------------------------
  {
    id: 'languages',
    label: 'Languages',
    kind: 'category',
    category: 'languages',
    x: 215,
    y: 130,
    level: 4,
    maxLevel: 5,
    xp: 900,
    xpNext: 1200,
    parent: 'dev',
    blurb: 'Breadth and depth across the languages you actually ship — weighted by how much you use each.',
  },
  {
    id: 'paradigms',
    label: 'Paradigms',
    kind: 'category',
    category: 'paradigms',
    x: 505,
    y: 130,
    level: 3,
    maxLevel: 5,
    xp: 640,
    xpNext: 900,
    parent: 'dev',
    blurb: 'How you structure code — object-oriented, functional and asynchronous patterns detected in your repos.',
  },
  {
    id: 'tooling',
    label: 'Tooling',
    kind: 'category',
    category: 'tooling',
    x: 215,
    y: 390,
    level: 2,
    maxLevel: 5,
    xp: 480,
    xpNext: 700,
    parent: 'dev',
    blurb: 'The systems around your code — containers, CI/CD and infrastructure-as-code.',
  },
  {
    id: 'quality',
    label: 'Quality',
    kind: 'category',
    category: 'quality',
    x: 505,
    y: 390,
    level: 2,
    maxLevel: 5,
    xp: 300,
    xpNext: 600,
    parent: 'dev',
    blurb: 'The habits that keep code healthy — tests, static typing and coverage.',
  },

  // --- Language skills ------------------------------------------------------
  {
    id: 'polyglot',
    label: 'Polyglot',
    kind: 'skill',
    category: 'languages',
    x: 85,
    y: 70,
    level: 3,
    maxLevel: 5,
    xp: 360,
    xpNext: 500,
    parent: 'languages',
    blurb: 'You commit in several languages with real fluency — not just hello-worlds.',
  },
  {
    id: 'typed',
    label: 'Typed',
    kind: 'skill',
    category: 'languages',
    x: 70,
    y: 195,
    level: 4,
    maxLevel: 5,
    xp: 520,
    xpNext: 650,
    parent: 'languages',
    blurb: 'Comfort with static typing and type-driven design across your stack.',
  },

  // --- Paradigm skills ------------------------------------------------------
  {
    id: 'oop',
    label: 'OOP',
    kind: 'skill',
    category: 'paradigms',
    x: 640,
    y: 70,
    level: 4,
    maxLevel: 5,
    xp: 480,
    xpNext: 600,
    parent: 'paradigms',
    blurb: 'Modelling with classes, interfaces and composition.',
  },
  {
    id: 'functional',
    label: 'Functional',
    kind: 'skill',
    category: 'paradigms',
    x: 655,
    y: 195,
    level: 2,
    maxLevel: 5,
    xp: 180,
    xpNext: 350,
    parent: 'paradigms',
    blurb: 'Pure functions, immutability and data pipelines — your strongest place to go deeper next.',
  },

  // --- Tooling skills -------------------------------------------------------
  {
    id: 'containers',
    label: 'Containers',
    kind: 'skill',
    category: 'tooling',
    x: 70,
    y: 330,
    level: 3,
    maxLevel: 5,
    xp: 300,
    xpNext: 450,
    parent: 'tooling',
    blurb: 'Dockerfiles and reproducible environments across your projects.',
  },
  {
    id: 'cicd',
    label: 'CI / CD',
    kind: 'skill',
    category: 'tooling',
    x: 85,
    y: 455,
    level: 2,
    maxLevel: 5,
    xp: 200,
    xpNext: 400,
    parent: 'tooling',
    blurb: 'Automated build, test and deploy pipelines wired into your repos.',
  },

  // --- Quality skills -------------------------------------------------------
  {
    id: 'testing',
    label: 'Testing',
    kind: 'skill',
    category: 'quality',
    x: 655,
    y: 330,
    level: 2,
    maxLevel: 5,
    xp: 160,
    xpNext: 350,
    parent: 'quality',
    blurb: 'Unit and integration tests that actually run in CI.',
  },
  {
    id: 'coverage',
    label: 'Coverage',
    kind: 'skill',
    category: 'quality',
    x: 640,
    y: 455,
    level: 0,
    maxLevel: 5,
    xp: 0,
    xpNext: 200,
    locked: true,
    parent: 'quality',
    blurb: 'Locked — start measuring coverage in CI to expand into this skill.',
  },
]

/** Lookup a node by id. Throws on unknown ids (the data set is fixed & known). */
export function getSkill(id: string): SkillNode {
  const node = skillNodes.find((n) => n.id === id)
  if (!node) throw new Error(`Unknown skill node: ${id}`)
  return node
}
