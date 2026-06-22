import { features } from '@/data/features'
import { Icon } from '@/components/ui/icons'
import { Reveal } from '@/components/ui/Reveal'
import { SectionHeading } from './SectionHeading'

export function FeatureGrid() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <SectionHeading index="03" title="feature_matrix" subtitle="what you get" />

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feature, i) => (
          <Reveal key={feature.id} from="up" delay={i * 80} className="h-full">
            <article className="group flex h-full flex-col rounded-lg border border-term-border bg-term-surface/60 p-5 transition-all duration-200 hover:-translate-y-1 hover:border-accent/50 hover:glow-box">
              <div className="mb-4 flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-md border border-term-border bg-term-bg-soft text-xl text-accent transition-colors group-hover:border-accent/50">
                  <Icon name={feature.icon} />
                </span>
                <span className="font-display text-3xl text-term-faint transition-colors group-hover:text-accent/40">
                  {feature.tag}
                </span>
              </div>

              <h3 className="text-base font-semibold text-term-fg">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-term-muted">{feature.blurb}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
