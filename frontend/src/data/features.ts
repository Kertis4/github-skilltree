import type { IconName } from '@/components/ui/icons'

export interface Feature {
  id: string
  /** Two-digit ordinal shown as a terminal-style label. */
  tag: string
  title: string
  blurb: string
  icon: IconName
}

/** The four pillars of the product, mirrored from the project README. */
export const features: Feature[] = [
  {
    id: 'xp',
    tag: '01',
    icon: 'bolt',
    title: 'XP & Levels',
    blurb:
      'XP comes from a transparent rubric — frequency, weight, spread across repos and recency. Every point traces back to real code.',
  },
  {
    id: 'tree',
    tag: '02',
    icon: 'tree',
    title: 'Skill Tree',
    blurb:
      'One shared taxonomy across every language, so progress is comparable. Go deeper on a strength or branch into an adjacent skill.',
  },
  {
    id: 'radar',
    tag: '03',
    icon: 'radar',
    title: 'Radar Chart',
    blurb:
      'Languages, paradigms, tooling and quality in a single shape — your developer fingerprint at a glance.',
  },
  {
    id: 'quests',
    tag: '04',
    icon: 'quest',
    title: 'Quest Log',
    blurb:
      'Personalized next steps with curated resources, so you grow on purpose instead of by accident.',
  },
]
