/**
 * Radar chart category definitions and theming.
 * Defines the 4 skill categories shown in the radar spider chart.
 */

export interface RadarCategory {
  key: 'Languages' | 'Paradigms' | 'Tooling' | 'Quality';
  label: string;
  icon?: string; // Icon name reference (e.g., 'Code', 'Zap', 'Wrench', 'Check')
  color: {
    default: string;
    hover: string;
  };
  description: string;
}

/**
 * Core radar categories matching the skill tree structure.
 * Colors follow a terminal/hacker theme (green, cyan, amber, magenta).
 * These are theme-aware but have sensible defaults.
 */
export const RADAR_CATEGORIES: RadarCategory[] = [
  {
    key: 'Languages',
    label: 'Languages',
    icon: 'Code',
    color: {
      default: 'hsl(120, 100%, 50%)', // Bright green
      hover: 'hsl(120, 100%, 60%)',
    },
    description: 'Programming languages and idioms mastered',
  },
  {
    key: 'Paradigms',
    label: 'Paradigms',
    icon: 'Zap',
    color: {
      default: 'hsl(180, 100%, 50%)', // Bright cyan
      hover: 'hsl(180, 100%, 60%)',
    },
    description: 'Programming paradigms (OOP, Functional, Async)',
  },
  {
    key: 'Tooling',
    label: 'Tooling & DevOps',
    icon: 'Wrench',
    color: {
      default: 'hsl(40, 100%, 50%)', // Bright amber/yellow
      hover: 'hsl(40, 100%, 60%)',
    },
    description: 'Tools, CI/CD, IaC, containerization',
  },
  {
    key: 'Quality',
    label: 'Code Quality',
    icon: 'Check',
    color: {
      default: 'hsl(320, 100%, 50%)', // Bright magenta
      hover: 'hsl(320, 100%, 60%)',
    },
    description: 'Testing, typing, code standards',
  },
];

/**
 * Get a category by key.
 */
export const getRadarCategory = (
  key: 'Languages' | 'Paradigms' | 'Tooling' | 'Quality'
): RadarCategory | undefined => {
  return RADAR_CATEGORIES.find((cat) => cat.key === key);
};

/**
 * Return CSS variable names for theme-aware colors (if using CSS variables).
 * Fallback to the hardcoded defaults if vars are not available.
 */
export const getCategoryColor = (
  key: 'Languages' | 'Paradigms' | 'Tooling' | 'Quality',
  state: 'default' | 'hover' = 'default'
): string => {
  const category = getRadarCategory(key);
  if (!category) return '#00ff00'; // Fallback to green

  // If you want to use CSS variables from site.ts later:
  // return `var(--color-${key.toLowerCase()})` or similar
  // For now, return hardcoded colors:
  return category.color[state];
};
