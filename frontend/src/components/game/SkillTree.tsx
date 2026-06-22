import { cn } from '@/lib/cn'
import { Icon } from '@/components/ui/icons'
import { CATEGORY_META, skillNodes, getSkill } from '@/data/skillTree'

const VIEW_W = 720
const VIEW_H = 520

/** Vertices of a pointy-top hexagon of the given radius, as an SVG points string. */
function hexPoints(r: number) {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90)
    pts.push(`${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`)
  }
  return pts.join(' ')
}

const radiusFor = (kind: string) => (kind === 'root' ? 30 : kind === 'category' ? 26 : 21)

interface SkillTreeProps {
  activeId: string
  onActivate: (id: string) => void
  className?: string
}

/**
 * The interactive skill-tree constellation. Hexagonal "talent" nodes connected
 * by glowing edges; hovering / focusing / tapping a node activates it (the
 * parent renders the detail panel). Pure SVG so it scales cleanly.
 */
export function SkillTree({ activeId, onActivate, className }: SkillTreeProps) {
  const edges = skillNodes.filter((n) => n.parent)

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className={cn('w-full select-none', className)}
      role="group"
      aria-label="Sample skill tree"
    >
      {/* edges */}
      <g>
        {edges.map((n) => {
          const p = getSkill(n.parent!)
          const color = CATEGORY_META[n.category].color
          const lit = activeId === n.id || activeId === n.parent
          return (
            <g key={`edge-${n.id}`}>
              <line
                x1={p.x}
                y1={p.y}
                x2={n.x}
                y2={n.y}
                stroke={color}
                strokeWidth={6}
                strokeLinecap="round"
                opacity={lit ? 0.22 : 0.09}
                style={{ transition: 'opacity .18s ease' }}
              />
              <line
                x1={p.x}
                y1={p.y}
                x2={n.x}
                y2={n.y}
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeDasharray={n.locked ? '4 6' : undefined}
                opacity={lit ? 0.9 : 0.4}
                style={{ transition: 'opacity .18s ease' }}
              />
            </g>
          )
        })}
      </g>

      {/* nodes */}
      <g>
        {skillNodes.map((n) => {
          const meta = CATEGORY_META[n.category]
          const color = meta.color
          const r = radiusFor(n.kind)
          const active = activeId === n.id
          const locked = !!n.locked

          return (
            <g
              key={n.id}
              transform={`translate(${n.x} ${n.y})`}
              role="button"
              tabIndex={0}
              aria-label={
                locked
                  ? `${n.label}, locked`
                  : `${n.label}, level ${n.level} of ${n.maxLevel}`
              }
              aria-pressed={active}
              onMouseEnter={() => onActivate(n.id)}
              onFocus={() => onActivate(n.id)}
              onClick={() => onActivate(n.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onActivate(n.id)
                }
              }}
              className="cursor-pointer outline-none"
              style={{
                color,
                filter: active ? `drop-shadow(0 0 12px ${color})` : undefined,
                transition: 'filter .18s ease',
              }}
            >
              <polygon
                points={hexPoints(r)}
                fill={
                  locked
                    ? 'rgba(255,255,255,0.015)'
                    : `color-mix(in srgb, ${color} 16%, transparent)`
                }
                stroke={color}
                strokeWidth={active ? 2.4 : 1.5}
                strokeDasharray={locked ? '4 5' : undefined}
                opacity={locked ? 0.55 : 1}
                style={{ transition: 'stroke-width .18s ease' }}
              />
              {n.kind !== 'skill' && (
                <polygon points={hexPoints(r - 6)} fill="none" stroke={color} strokeWidth={1} opacity={0.3} />
              )}

              {/* interior: icon for hubs, level number for skills */}
              {n.kind === 'skill' ? (
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="font-display"
                  style={{ fontSize: 19, fill: locked ? 'var(--color-term-dim)' : color }}
                >
                  {locked ? '+' : n.level}
                </text>
              ) : (
                <Icon
                  name={meta.icon}
                  width={n.kind === 'root' ? 28 : 24}
                  height={n.kind === 'root' ? 28 : 24}
                  x={n.kind === 'root' ? -14 : -12}
                  y={n.kind === 'root' ? -14 : -12}
                  strokeWidth={1.6}
                />
              )}

              {/* label */}
              <text
                textAnchor="middle"
                y={r + 17}
                className="font-mono"
                style={{
                  fontSize: 12.5,
                  fill: active ? 'var(--color-term-fg)' : 'var(--color-term-muted)',
                  transition: 'fill .18s ease',
                }}
              >
                {n.label}
              </text>
              {n.kind !== 'skill' && !locked && (
                <text
                  textAnchor="middle"
                  y={r + 32}
                  className="font-mono"
                  style={{ fontSize: 10.5, fill: 'var(--color-term-dim)' }}
                >
                  Lv {n.level}
                </text>
              )}
            </g>
          )
        })}
      </g>
    </svg>
  )
}
