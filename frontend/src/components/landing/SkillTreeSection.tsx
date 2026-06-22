import { useState } from 'react'
import { SectionHeading } from './SectionHeading'
import { Reveal } from '@/components/ui/Reveal'
import { SkillTree } from '@/components/game/SkillTree'
import { XPBar } from '@/components/game/XPBar'
import {
  CATEGORY_META,
  getSkill,
  type SkillCategory,
} from '@/data/skillTree'

const KIND_LABEL: Record<string, string> = {
  root: 'Overall profile',
  category: 'Skill branch',
  skill: 'Skill node',
}

const LEGEND: SkillCategory[] = ['languages', 'paradigms', 'tooling', 'quality']

export function SkillTreeSection() {
  const [activeId, setActiveId] = useState('functional')
  const node = getSkill(activeId)
  const meta = CATEGORY_META[node.category]

  const toNext = Math.max(0, node.xpNext - node.xp)
  const status = node.locked
    ? 'locked — expand here to start this branch'
    : node.level >= node.maxLevel
      ? 'mastered — branch complete'
      : `deepen · ${toNext} XP to Lv ${node.level + 1}`

  return (
    <section id="skills" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <SectionHeading
        index="01"
        title="skill_tree"
        subtitle="deepen a branch or expand into a new one"
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* tree */}
        <Reveal from="left" className="h-full">
          <div className="relative h-full rounded-lg border border-term-border bg-term-surface/40 p-3 sm:p-5">
            <SkillTree activeId={activeId} onActivate={setActiveId} />

            {/* legend */}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 border-t border-term-border pt-3 text-xs text-term-dim">
              {LEGEND.map((cat) => (
                <span key={cat} className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-[2px]"
                    style={{ background: CATEGORY_META[cat].color }}
                  />
                  {CATEGORY_META[cat].label}
                </span>
              ))}
              <span className="hidden items-center gap-1.5 sm:flex">
                <span className="size-2 rounded-[2px] border border-dashed border-term-dim" />
                locked
              </span>
            </div>
          </div>
        </Reveal>

        {/* detail panel */}
        <Reveal from="right" delay={120} className="h-full">
          <aside className="flex h-full flex-col rounded-lg border border-term-border bg-term-surface/60 p-5">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest" style={{ color: meta.color }}>
              <span className="size-2 rounded-[2px]" style={{ background: meta.color }} />
              {meta.label} · {KIND_LABEL[node.kind]}
            </div>

            <h3 className="mt-2 font-display text-3xl leading-none text-term-fg">{node.label}</h3>

            <div className="mt-4 flex items-baseline justify-between text-xs text-term-dim">
              <span>
                level{' '}
                <span className="font-display text-base text-term-fg">{node.level}</span>
                <span className="text-term-faint"> / {node.maxLevel}</span>
              </span>
              <span>
                {node.xp.toLocaleString()} / {node.xpNext.toLocaleString()} XP
              </span>
            </div>
            <XPBar value={node.xp} max={node.xpNext} color={meta.color} className="mt-2" />

            <p className="mt-4 flex-1 text-sm leading-relaxed text-term-muted">{node.blurb}</p>

            <div
              className="mt-4 flex items-center gap-2 border-t border-term-border pt-3 text-xs"
              style={{ color: node.locked ? 'var(--color-term-dim)' : meta.color }}
            >
              <span aria-hidden>{node.locked ? '◇' : node.level >= node.maxLevel ? '★' : '▸'}</span>
              <span>{status}</span>
            </div>

            <p className="mt-4 text-[11px] leading-relaxed text-term-dim">
              sample data — your real tree is built from your repositories after you connect.
            </p>
          </aside>
        </Reveal>
      </div>
    </section>
  )
}
