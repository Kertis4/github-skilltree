import { useMemo } from 'react'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, ResponsiveContainer } from 'recharts'
import { motion } from 'framer-motion'
import { RADAR_CATEGORIES } from '@/data/radarData'
import type { RadarData } from '@/types/api'
import { cn } from '@/lib/cn'

export interface SkillRadarProps {
  data: RadarData
  width?: number
  height?: number
  className?: string
}

interface RadarTooltipPayload {
  payload: {
    key: keyof RadarData
    value: number
  }
}

interface RadarTooltipProps {
  active?: boolean
  payload?: RadarTooltipPayload[]
}

/**
 * Custom tooltip for radar chart hover display
 */
const RadarTooltip = ({ active, payload }: RadarTooltipProps) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    const category = RADAR_CATEGORIES.find((cat) => cat.key === data.key)
    return (
      <div className="rounded-lg border border-accent/45 bg-term-bg/95 px-3 py-2 shadow-[0_0_30px_-10px_var(--accent)] backdrop-blur-sm">
        <p className="text-term-fg text-xs font-mono tracking-wide">{category?.label}</p>
        <p className="text-accent text-sm font-bold glow-text-soft">{data.value} / 100</p>
      </div>
    )
  }
  return null
}

/**
 * SkillRadar - Interactive radar/spider chart visualization of skill categories
 * Shows proficiency levels across Languages, Paradigms, Tooling, and Quality
 */
export const SkillRadar = ({
  data,
  width = 400,
  height = 400,
  className,
}: SkillRadarProps) => {
  // Transform radar data into Recharts format
  const chartData = useMemo(() => {
    return RADAR_CATEGORIES.map((category) => ({
      key: category.key,
      name: category.label,
      value: data[category.key as keyof RadarData] || 0,
      innerValue: Math.max(0, Math.round((data[category.key as keyof RadarData] || 0) * 0.78)),
      icon: category.icon,
    }))
  }, [data])

  const primaryColor = 'var(--accent)'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className={cn('relative flex h-full w-full items-center justify-center text-term-fg', className)}
    >
      {/* Ambient pulse layers behind the chart for neon CRT depth */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-[9%] rounded-full border border-accent/20"
        animate={{ scale: [1, 1.06, 1], opacity: [0.25, 0.55, 0.25] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-[15%] rounded-full border border-accent/20"
        animate={{ scale: [1.04, 1, 1.04], opacity: [0.2, 0.42, 0.2] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
      />

      <ResponsiveContainer width={width} height={height}>
        <RadarChart data={chartData} margin={{ top: 40, right: 40, bottom: 40, left: 40 }}>
          <defs>
            <linearGradient id="radarFillGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={primaryColor} stopOpacity={0.55} />
              <stop offset="55%" stopColor={primaryColor} stopOpacity={0.2} />
              <stop offset="100%" stopColor={primaryColor} stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id="radarInnerFillGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={primaryColor} stopOpacity={0.3} />
              <stop offset="100%" stopColor={primaryColor} stopOpacity={0.04} />
            </linearGradient>
            <filter id="radarNeonGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Grid background */}
          <PolarGrid stroke="currentColor" strokeOpacity={0.18} radialLines={true} />

          {/* Angle labels (category names) */}
          <PolarAngleAxis
            dataKey="name"
            tick={{ fill: 'currentColor', fontSize: 12, opacity: 0.86 }}
            orientation="outer"
          />

          {/* Radius scale (0-100) */}
          <PolarRadiusAxis
            domain={[0, 100]}
            tick={{ fill: 'currentColor', fontSize: 11, opacity: 0.65 }}
            ticks={[25, 50, 75, 100]}
            axisLine={false}
          />

          {/* Glow shell behind the main polygon */}
          <Radar
            name="Skill Proficiency Glow"
            dataKey="value"
            stroke={primaryColor}
            fill={primaryColor}
            fillOpacity={0.04}
            isAnimationActive={true}
            animationDuration={1400}
            animationBegin={120}
            strokeWidth={5}
            filter="url(#radarNeonGlow)"
            dot={false}
          />

          {/* Inner polygon adds depth and shape clarity */}
          <Radar
            name="Skill Proficiency Inner"
            dataKey="innerValue"
            stroke={primaryColor}
            strokeOpacity={0.55}
            fill="url(#radarInnerFillGradient)"
            fillOpacity={1}
            isAnimationActive={true}
            animationDuration={900}
            animationBegin={80}
            strokeWidth={1.1}
            dot={false}
          />

          {/* Main data radar */}
          <Radar
            name="Skill Proficiency"
            dataKey="value"
            stroke={primaryColor}
            fill="url(#radarFillGradient)"
            fillOpacity={1}
            isAnimationActive={true}
            animationDuration={1100}
            animationBegin={40}
            strokeWidth={2.6}
            dot={{ fill: primaryColor, r: 5, strokeWidth: 2, stroke: 'var(--color-term-bg)' }}
            activeDot={{
              r: 8,
              fillOpacity: 1,
              strokeWidth: 2,
              stroke: 'var(--color-term-fg)',
              filter: 'url(#radarNeonGlow)',
            }}
          />

          {/* Hover tooltip */}
          <Tooltip
            content={<RadarTooltip />}
            cursor={{ stroke: primaryColor, strokeWidth: 1.4, strokeOpacity: 0.7 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </motion.div>
  )
}






