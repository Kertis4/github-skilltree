/**
 * radar.ts
 *
 * Derives the four radar-chart axes from the real analysis output.
 *
 * The spider chart summarises a profile into four high-level areas. Each
 * taxonomy skill belongs to a fine-grained `domain`; here we fold those domains
 * into the radar's four axes (the same buckets the skill tree uses for colour)
 * and average each skill's 0..100 score across its axis.
 *
 * The mean is taken over EVERY taxonomy skill in the bucket — skills you haven't
 * demonstrated count as 0 — so the radar reads as "proficiency × coverage" and
 * stays consistent with the pipeline's overall score (also a mean over all
 * skills). An empty axis simply means room to grow.
 */

import type { SkillAnalysis } from '@/lib/auth'
import type { RadarData } from '@/types/api'
import taxonomyJson from '@/data/taxonomy.json'

interface TaxSkillLite {
  id: string
  domain: string
}
interface TaxonomyLite {
  skills: TaxSkillLite[]
}

const TAXONOMY = taxonomyJson as unknown as TaxonomyLite

/** Fine-grained taxonomy domain → one of the radar's four axes. */
const DOMAIN_AXIS: Record<string, keyof RadarData> = {
  languages: 'Languages',
  paradigms: 'Paradigms',
  architecture: 'Paradigms',
  frameworks: 'Tooling',
  'build-tooling': 'Tooling',
  data: 'Tooling',
  infrastructure: 'Tooling',
  quality: 'Quality',
}

const ZERO: RadarData = { Languages: 0, Paradigms: 0, Tooling: 0, Quality: 0 }

/**
 * Compute the four radar axes (0..100) from a detection result. Pass `null` to
 * get a flat, all-zero radar (the pre-analysis baseline).
 */
export function computeRadar(analysis: SkillAnalysis | null): RadarData {
  if (!analysis) return { ...ZERO }

  const sums: Record<keyof RadarData, number> = { ...ZERO }
  const counts: Record<keyof RadarData, number> = { ...ZERO }

  // "Programming Basics" is foundational and isn't emitted by the detector — if
  // the user has any analysed source (or any demonstrated skill), they can code.
  const canCode =
    analysis.stats.reposWithSource > 0 ||
    Object.values(analysis.skillset).some((s) => s.present)

  for (const skill of TAXONOMY.skills) {
    const axis = DOMAIN_AXIS[skill.domain]
    if (!axis) continue
    const score =
      skill.id === 'programming'
        ? canCode
          ? analysis.overallScore
          : 0
        : (analysis.skillset[skill.id]?.score ?? 0)
    sums[axis] += score
    counts[axis] += 1
  }

  const mean = (axis: keyof RadarData): number =>
    counts[axis] > 0 ? Math.round(sums[axis] / counts[axis]) : 0

  return {
    Languages: mean('Languages'),
    Paradigms: mean('Paradigms'),
    Tooling: mean('Tooling'),
    Quality: mean('Quality'),
  }
}
