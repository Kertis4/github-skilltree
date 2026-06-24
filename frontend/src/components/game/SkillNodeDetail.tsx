/**
 * SkillNodeDetail.tsx
 * 
 * Floating detail card shown on hover over a skill node.
 * Displays skill name, level, XP progress, evidence, and recommendations.
 */

import { useEffect, useRef, useState } from 'react'
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
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [cardPosition, setCardPosition] = useState(position)

  const totalXpNeeded = getXpThreshold(skill.level + 1)
  // Keep bar math aligned with the displayed numbers: "xp / totalXpNeeded".
  const normalizedTotalProgress = totalXpNeeded > 0 ? skill.xp / totalXpNeeded : 0
  const xpProgress = Math.max(0, Math.min(normalizedTotalProgress, 1))

  useEffect(() => {
    if (!isVisible || !cardRef.current) return

    const updatePosition = () => {
      const viewportPadding = 12
      const cardWidth = cardRef.current?.offsetWidth ?? 320
      const cardHeight = cardRef.current?.offsetHeight ?? 220

      // Clamp position to guaranteed safe range if it's outside bounds
      let safeX = position.x
      let safeY = position.y
      
      // If position is clearly outside viewport, adjust it
      if (safeX < 0 || safeX > window.innerWidth) {
        safeX = Math.max(viewportPadding, Math.min(safeX, window.innerWidth - viewportPadding))
      }
      if (safeY < 0 || safeY > window.innerHeight) {
        safeY = Math.max(viewportPadding, Math.min(safeY, window.innerHeight - viewportPadding))
      }

      // Try multiple positions: centered above, then left/right/below as fallback
      let candidatePositions: Array<{ x: number; y: number; name: string }> = []

      // 1. Centered above (default)
      candidatePositions.push({
        x: safeX - cardWidth / 2,
        y: safeY - cardHeight - 12,
        name: 'centered-above'
      })

      // 2. Left-aligned
      candidatePositions.push({
        x: safeX - cardWidth - 8,
        y: safeY - cardHeight / 2,
        name: 'left'
      })

      // 3. Right-aligned
      candidatePositions.push({
        x: safeX + 8,
        y: safeY - cardHeight / 2,
        name: 'right'
      })

      // 4. Below the node
      candidatePositions.push({
        x: safeX - cardWidth / 2,
        y: safeY + 12,
        name: 'below'
      })

      // 5. Above and pushed left (for far-right nodes)
      candidatePositions.push({
        x: Math.max(viewportPadding, safeX - cardWidth - 8),
        y: safeY - cardHeight - 12,
        name: 'above-left'
      })

      // 6. Above and pushed right (for far-left nodes)
      candidatePositions.push({
        x: Math.min(window.innerWidth - cardWidth - viewportPadding, safeX + 8),
        y: safeY - cardHeight - 12,
        name: 'above-right'
      })

      // Find the first position that fits entirely within viewport
      let selectedPos = candidatePositions[0]
      for (const candidate of candidatePositions) {
        const fitsX = candidate.x >= viewportPadding && candidate.x + cardWidth <= window.innerWidth - viewportPadding
        const fitsY = candidate.y >= viewportPadding && candidate.y + cardHeight <= window.innerHeight - viewportPadding
        if (fitsX && fitsY) {
          selectedPos = candidate
          break
        }
      }

      // Final safety clamp to viewport
      const left = Math.max(
        viewportPadding,
        Math.min(selectedPos.x, window.innerWidth - cardWidth - viewportPadding)
      )
      const top = Math.max(
        viewportPadding,
        Math.min(selectedPos.y, window.innerHeight - cardHeight - viewportPadding)
      )

      setCardPosition({ x: left, y: top })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isVisible, position.x, position.y, skill.id])

  return (
    <motion.div
      ref={cardRef}
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
        left: `${cardPosition.x}px`,
        top: `${cardPosition.y}px`,
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
            animate={{
              width: `${Math.min(xpProgress * 100, 100)}%`,
              boxShadow: [
                '0 0 0px var(--accent)',
                '0 0 8px var(--accent), 0 0 16px var(--accent-bright)',
                '0 0 0px var(--accent)'
              ],
            }}
            transition={{
              width: { duration: 0.6, ease: 'easeOut' },
              boxShadow: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' },
            }}
            className="h-full rounded-full bg-gradient-to-r from-accent to-accent-bright"
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
