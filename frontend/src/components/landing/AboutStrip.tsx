import { Icon, type IconName } from '@/components/ui/icons'
import { Reveal } from '@/components/ui/Reveal'
import { SectionHeading } from './SectionHeading'

const points: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'cpu',
    title: 'signals over dumps',
    body: 'We read file trees, extensions, language stats and manifests first — detecting ~70% of skills with zero LLM calls.',
  },
  {
    icon: 'bolt',
    title: 'xp you can defend',
    body: 'Scores come from a deterministic rubric, not model vibes. The LLM only adds evidence and recommendations.',
  },
  {
    icon: 'shield',
    title: 'safe by default',
    body: 'Public repos only, minimal scopes, internal Azure OpenAI. Your code never leaves for a public API.',
  },
]

export function AboutStrip() {
  return (
    <section id="about" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <SectionHeading index="02" title="about" subtitle="how the analysis stays honest" />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {points.map((point, i) => (
          <Reveal key={point.title} from="up" delay={i * 90} className="h-full">
            <div className="h-full rounded-lg border border-term-border bg-term-surface/50 p-5 transition-colors hover:border-accent/40">
              <span className="mb-3 inline-flex size-9 items-center justify-center rounded-md border border-term-border bg-term-bg-soft text-lg text-accent">
                <Icon name={point.icon} />
              </span>
              <h3 className="text-base text-term-fg">{point.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-term-muted">{point.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
