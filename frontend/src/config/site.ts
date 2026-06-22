/**
 * Single source of truth for site-wide copy and config. Tweak strings here
 * rather than hunting through components.
 */
export const site = {
  name: 'GitHub SkillTree',
  brand: 'skilltree',
  user: 'guest',
  host: 'skilltree',
  version: 'v0.1.0',
  tagline: 'Level up your dev skills like an RPG.',
  description:
    'Parse your GitHub, earn XP, unlock a skill tree, and get a personalized quest log to grow as a developer.',
  repoUrl: 'https://github.com',
  nav: [
    { label: 'skills', href: '#skills' },
    { label: 'about', href: '#about' },
    { label: 'features', href: '#features' },
  ],
} as const

export type ThemeName = 'green' | 'amber' | 'cyan' | 'magenta'

/** Accent themes exposed by the in-app theme switcher. */
export const THEMES: ReadonlyArray<{ name: ThemeName; label: string }> = [
  { name: 'green', label: 'phosphor' },
  { name: 'amber', label: 'amber' },
  { name: 'cyan', label: 'ice' },
  { name: 'magenta', label: 'synth' },
]
