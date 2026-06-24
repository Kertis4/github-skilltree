/**
 * SkillTreeViz.tsx
 * 
 * Interactive skill tree visualization for the dashboard.
 * Uses mock profile data, renders SVG hexagon nodes with Framer Motion animations.
 * Supports hover details, expand/collapse interactions, and smooth transitions.
 */

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import type { Skill } from '@/types/api'
import { calculateTreeLayout, generateConnectorPath } from '@/lib/skillTreeLayout'
import { SkillNodeDetail } from './SkillNodeDetail'
import { getCategoryColor } from '@/data/radarData'
import { cn } from '@/lib/cn'

interface SkillTreeVizProps {
  skills: Skill[]
  width?: number
  height?: number
  className?: string
}

/**
 * SVG hexagon points string (pointy-top, standard orientation).
 */
function hexPoints(radius: number): string {
  const points: string[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90)
    points.push(
      `${(radius * Math.cos(angle)).toFixed(1)},${(radius * Math.sin(angle)).toFixed(1)}`
    )
  }
  return points.join(' ')
}

/**
 * Get hexagon radius based on depth/level.
 */
const getNodeRadius = (skill: Skill): number => {
  // Deeper skills are smaller
  const depth = getSkillDepth(skill)
  if (depth === 0) return 30 // Root
  if (depth === 1) return 26 // Top-level categories
  return 21 // Leaf skills
}

/**
 * Calculate depth (distance from root in tree).
 */
const getSkillDepth = (skill: Skill): number => {
  if (!skill.parent_id) return 0
  return 1
}

function getSkillCategoryColor(skill: Skill): string {
  switch (skill.category) {
    case 'Languages':
      return getCategoryColor('Languages')
    case 'Paradigms':
      return getCategoryColor('Paradigms')
    case 'Tooling & DevOps':
      return getCategoryColor('Tooling')
    case 'Code Quality':
      return getCategoryColor('Quality')
  }
}

export function SkillTreeViz({
  skills,
  width = 900,
  height = 700,
  className,
}: SkillTreeVizProps) {
  // Compute initial expanded set: all skills that have children
  const initialExpanded = useMemo(() => {
    const parentIds = new Set<string>()
    skills.forEach((skill) => {
      if (skill.parent_id) {
        parentIds.add(skill.parent_id)
      }
    })
    return parentIds
  }, [skills])

  // State management
  const [hoveredSkillId, setHoveredSkillId] = useState<string | null>(null)
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(initialExpanded)

  // Build skill index
  const skillsById = useMemo(() => new Map(skills.map((s) => [s.id, s])), [skills])

  // Filter visible skills based on expandedNodeIds
  const visibleSkills = useMemo(() => {
    return skills.filter((skill) => {
      if (!skill.parent_id) return true // Always show root skills
      // Show if parent is expanded OR if parent is not a container
      return expandedNodeIds.has(skill.parent_id) || !skillsById.has(skill.parent_id)
    })
  }, [skills, expandedNodeIds, skillsById])

  // Calculate layout
  const layout = useMemo(() => {
    return calculateTreeLayout(visibleSkills, width, height)
  }, [visibleSkills, width, height])

  // Build position map
  const positionMap = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    layout.nodes.forEach((node) => {
      map.set(node.skillId, { x: node.x, y: node.y })
    })
    return map
  }, [layout])

  // Toggle expand/collapse
  const toggleExpanded = (skillId: string) => {
    const newExpanded = new Set(expandedNodeIds)
    if (newExpanded.has(skillId)) {
      newExpanded.delete(skillId)
    } else {
      newExpanded.add(skillId)
    }
    setExpandedNodeIds(newExpanded)
  }

  const hoveredSkill = hoveredSkillId ? skillsById.get(hoveredSkillId) : null
  const hoveredPos = hoveredSkillId ? positionMap.get(hoveredSkillId) : null

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-2xl border border-term-border-bright bg-term-bg/55 shadow-[0_0_0_1px_rgba(43,255,136,0.05)]',
        className
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-fade opacity-10" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute left-12 top-8 h-36 w-36 rounded-full bg-accent/6 blur-3xl" />

      {/* SVG Canvas */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="relative z-10 w-full h-auto"
        role="group"
        aria-label="Interactive skill tree"
      >
        {/* Connector lines between parent/child skills */}
        <defs>
          {layout.connections.map((conn) => {
            const skill = skillsById.get(conn.to)
            if (!skill) return null
            return (
              <filter key={`glow-${conn.from}-${conn.to}`} id={`glow-${conn.from}-${conn.to}`}>
                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            )
          })}
        </defs>
        <g>
          {layout.connections.map((conn) => {
            const fromNode = layout.nodes.find((n) => n.skillId === conn.from)
            const toNode = layout.nodes.find((n) => n.skillId === conn.to)
            const skill = skillsById.get(conn.to)

            if (!fromNode || !toNode || !skill) return null

            const isActive = hoveredSkillId === conn.to || hoveredSkillId === conn.from
            const color = getSkillCategoryColor(skill)

            return (
              <motion.path
                key={`connector-${conn.from}-${conn.to}`}
                d={generateConnectorPath(fromNode, toNode)}
                stroke={color}
                strokeWidth={isActive ? 3.5 : 2.2}
                fill="none"
                strokeLinecap="round"
                filter={`url(#glow-${conn.from}-${conn.to})`}
                initial={{ opacity: 0.55 }}
                animate={{ opacity: isActive ? 1 : 0.55 }}
                transition={{ duration: 0.2 }}
              />
            )
          })}
        </g>

        {/* Skill nodes */}
        <g>
          {layout.nodes.map((node) => {
            const skill = skillsById.get(node.skillId)
            if (!skill) return null

            const radius = getNodeRadius(skill)
            const isHovered = hoveredSkillId === node.skillId
            const isChild = layout.nodes.some(
              (n) => skillsById.get(n.skillId)?.parent_id === node.skillId
            )
            const isExpanded = expandedNodeIds.has(node.skillId)
            const color = getSkillCategoryColor(skill)

            return (
              <motion.g
                key={node.skillId}
                transform={`translate(${node.x} ${node.y})`}
                role="button"
                tabIndex={0}
                aria-label={`${skill.name}, Level ${skill.level}`}
                onMouseEnter={() => {
                  setHoveredSkillId(node.skillId)
                }}
                onMouseLeave={() => setHoveredSkillId(null)}
                onClick={() => {
                  if (isChild) toggleExpanded(node.skillId)
                }}
                className={isChild ? 'cursor-pointer' : 'cursor-default'}
                style={{
                  color,
                  transition: 'filter 0.2s ease',
                  filter: isHovered ? `drop-shadow(0 0 12px ${color})` : undefined,
                }}
              >
                {/* Hexagon background */}
                <motion.polygon
                  points={hexPoints(radius)}
                  fill={`color-mix(in srgb, ${color} 12%, transparent)`}
                  stroke={color}
                  initial={{ strokeWidth: 1.5 }}
                  animate={{
                    strokeWidth: isHovered ? 2.5 : 1.5,
                  }}
                  transition={{ duration: 0.2 }}
                  opacity={0.8}
                />

                {/* Inner ring (for categories) */}
                {!skill.parent_id && (
                  <circle
                    cx={0}
                    cy={0}
                    r={radius - 8}
                    fill="none"
                    stroke={color}
                    strokeWidth={1}
                    opacity={0.4}
                  />
                )}

                {/* Level indicator */}
                <motion.text
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="font-mono font-bold"
                  style={{ fontSize: 18, fill: color }}
                  initial={{ scale: 1 }}
                  animate={{
                    scale: isHovered ? 1.15 : 1,
                  }}
                  transition={{ duration: 0.2 }}
                >
                  {skill.level}
                </motion.text>

                {/* Skill name label */}
                <motion.text
                  textAnchor="middle"
                  y={radius + 18}
                  className="font-mono"
                  style={{
                    fontSize: 11,
                    fill: isHovered ? 'var(--color-term-fg)' : 'var(--color-term-muted)',
                  }}
                  initial={{ opacity: 0.7 }}
                  animate={{ opacity: isHovered ? 1 : 0.7 }}
                  transition={{ duration: 0.2 }}
                >
                  {skill.name}
                </motion.text>

                {/* Expand/collapse indicator (if has children) */}
                {isChild && (
                  <motion.text
                    textAnchor="middle"
                    y={-radius - 8}
                    className="font-mono text-xs"
                    style={{
                      fill: color,
                      userSelect: 'none',
                    }}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{
                      opacity: isHovered ? 1 : 0,
                      scale: isHovered ? 1 : 0,
                    }}
                    transition={{ duration: 0.2 }}
                  >
                    {isExpanded ? '−' : '+'}
                  </motion.text>
                )}

                {/* Glow effect on hover */}
                {isHovered && (
                  <motion.circle
                    cx={0}
                    cy={0}
                    r={radius + 4}
                    fill="none"
                    stroke={color}
                    strokeWidth={1}
                    opacity={0.3}
                    initial={{ r: radius, opacity: 0.5 }}
                    animate={{
                      r: radius + 8,
                      opacity: 0,
                    }}
                    transition={{
                      duration: 0.6,
                      repeat: Infinity,
                    }}
                  />
                )}
              </motion.g>
            )
          })}
        </g>
      </svg>

      {/* Hover detail card */}
      {hoveredSkill && hoveredPos && (
        <SkillNodeDetail
          skill={hoveredSkill}
          isVisible={!!hoveredSkill}
          position={hoveredPos}
        />
      )}
    </div>
  )
}
