/**
 * SkillNodeDetail.tsx
 * 
 * Floating detail card shown on hover over a skill node.
 * Displays skill name, level, XP progress, evidence, and recommendations.
 */

import { motion } from 'framer-motion'
import type { Skill } from '@/types/api'
import { cn } from '@/lib/cn'

interface SkillNodeDetailProps {
  skill: Skill
  isVisible: boolean
  position: { x: number; y: number }
  className?: string
}

/**
 * Calculate the next level threshold (using RPG square root curve: level = floor(sqrt(xp / K)))
 * K = 100 for easier demo math
 */
const getXpThreshold = (level: number): number => {
  const K = 100
  return level * level * K
}

export function SkillNodeDetail({
  skill,
  isVisible,
  position,
  className,
}: SkillNodeDetailProps) {
  const totalXpNeeded = getXpThreshold(skill.level + 1)
  const currentLevelXp = getXpThreshold(skill.level)
  const xpInLevel = Math.max(0, skill.xp - currentLevelXp)
  const xpToNextLevel = totalXpNeeded - currentLevelXp
  const xpProgress = xpToNextLevel > 0 ? Math.min(xpInLevel / xpToNextLevel, 1) : 0

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={isVisible ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.95, y: -10 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn(
        'pointer-events-none fixed z-50',
        'bg-term-bg border border-term-fg rounded-lg',
        'p-3 shadow-lg backdrop-blur-sm',
        'min-w-64 max-w-sm',
        className
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -100%)',
        marginTop: '-8px',
      }}
    >
      {/* Header: Skill name + level badge */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-term-fg text-sm">{skill.name}</h3>
        <span className="bg-accent text-term-bg px-2 py-1 rounded text-xs font-mono">
          Lv {skill.level}
        </span>
      </div>

      {/* Category badge */}
      <div className="mb-2">
        <span className="inline-block text-xs bg-term-dim text-term-fg px-2 py-0.5 rounded">
          {skill.category}
        </span>
      </div>

      {/* XP Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between items-center text-xs text-term-dim mb-1">
          <span>XP Progress</span>
          <span className="font-mono">
            {skill.xp} / {totalXpNeeded}
          </span>
        </div>
        <div className="w-full bg-term-dim rounded-full h-2 overflow-hidden border border-term-fg border-opacity-20">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(xpProgress * 100, 100)}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-accent to-accent-bright"
          />
        </div>
      </div>

      {/* Evidence snippets */}
      {skill.evidence && skill.evidence.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-term-dim font-mono mb-1">Evidence:</p>
          <ul className="text-xs text-term-muted space-y-1">
            {skill.evidence.slice(0, 2).map((ev, i) => (
              <li key={i} className="font-mono line-clamp-1 hover:line-clamp-none">
                → {ev}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Description or skill context */}
      {skill.description && (
        <p className="text-xs text-term-muted italic mb-2">{skill.description}</p>
      )}

      {/* Recommendation badge */}
      <div className="text-xs bg-term-bg border border-accent border-opacity-30 rounded px-2 py-1">
        {skill.parent_id ? (
          <span className="text-accent">
            <strong>Deepen:</strong> Master the next level
          </span>
        ) : (
          <span className="text-accent-bright">
            <strong>Core:</strong> Expand into sub-skills
          </span>
        )}
      </div>
    </motion.div>
  )
}
