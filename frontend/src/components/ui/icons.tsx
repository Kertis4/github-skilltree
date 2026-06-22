import type { ReactNode, SVGProps } from 'react'

/** Names of every glyph available through <Icon name="..." />. */
export type IconName =
  | 'github'
  | 'terminal'
  | 'tree'
  | 'bolt'
  | 'radar'
  | 'quest'
  | 'shield'
  | 'cpu'
  | 'code'
  | 'arrowRight'
  | 'chevronRight'
  | 'sparkles'
  | 'play'
  | 'dot'

/** Stroked 24x24 glyphs. `github` is filled and handled separately below. */
const shapes: Record<Exclude<IconName, 'github'>, ReactNode> = {
  terminal: (
    <>
      <rect x="2.5" y="4" width="19" height="16" rx="2" />
      <path d="M6 9l3 3-3 3" />
      <path d="M12.5 15h4" />
    </>
  ),
  tree: (
    <>
      <circle cx="12" cy="4.5" r="2" />
      <circle cx="6" cy="19.5" r="2" />
      <circle cx="18" cy="19.5" r="2" />
      <path d="M12 6.5v4M12 10.5L6.8 17.8M12 10.5l5.2 7.3" />
    </>
  ),
  bolt: <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" />,
  radar: (
    <>
      <polygon points="12 3 20.5 9 17.2 19 6.8 19 3.5 9" />
      <polygon points="12 8 16 11 14.5 16 9.5 16 8 11" />
      <path d="M12 3v5M3.5 9l4.5 2M20.5 9l-4.5 2" />
    </>
  ),
  quest: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2.2 3.2L16 10.5H5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 4.6-3.2 7.7-8 9-4.8-1.3-8-4.4-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <rect x="9.5" y="9.5" width="5" height="5" />
      <path d="M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M4 12h15" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7z" />
      <path d="M18 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </>
  ),
  play: <path d="M7 4.5v15l13-7.5z" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  code: (
    <>
      <path d="M8.5 8.5 5 12l3.5 3.5" />
      <path d="M15.5 8.5 19 12l-3.5 3.5" />
      <path d="M13.5 6.5l-3 11" />
    </>
  ),
  dot: <circle cx="12" cy="12" r="3" />,
}

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  strokeWidth?: number
}

/**
 * Inline SVG icon. Sized with `1em` so it scales with font-size; color follows
 * `currentColor`. Use Tailwind sizing/text utilities to control it.
 */
export function Icon({ name, strokeWidth = 1.6, ...props }: IconProps) {
  if (name === 'github') {
    return (
      <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden {...props}>
        <path d="M12 .5C5.73.5.5 5.74.5 12.04c0 5.1 3.29 9.43 7.86 10.96.58.11.79-.25.79-.56v-2.02c-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.05.78 2.12v3.14c0 .31.21.67.8.56A11.53 11.53 0 0 0 23.5 12.04C23.5 5.74 18.27.5 12 .5Z" />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {shapes[name]}
    </svg>
  )
}
