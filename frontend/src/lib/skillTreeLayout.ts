/**
 * Skill tree layout and positioning helpers.
 * Calculates SVG coordinates for hierarchical tree rendering.
 */

import type { Skill } from '@/types/api';

export interface SkillNodePosition {
  skillId: string;
  x: number;
  y: number;
  radius: number;
}

export interface TreeLayout {
  nodes: SkillNodePosition[];
  connections: Array<{ from: string; to: string }>;
  bounds: { width: number; height: number };
}

/**
 * Calculate positions for skill nodes in a hierarchical tree layout.
 * Uses a simple level-based positioning algorithm:
 * - Root at center top
 * - Each level moves down
 * - Siblings spread horizontally
 */
export const calculateTreeLayout = (
  skills: Skill[],
  maxWidth: number = 800,
  maxHeight: number = 600
): TreeLayout => {
  const nodes: SkillNodePosition[] = [];
  const connections: Array<{ from: string; to: string }> = [];
  const nodeRadius = 30; // SVG circle/hexagon radius

  // Group skills by level (distance from root)
  const skillsById = new Map(skills.map((s) => [s.id, s]));
  const levels = new Map<number, Skill[]>();

  // Build tree structure
  const getLevel = (skill: Skill, visited = new Set<string>()): number => {
    if (visited.has(skill.id)) return 0;
    visited.add(skill.id);

    if (!skill.parent_id) return 0;
    const parent = skillsById.get(skill.parent_id);
    if (!parent) return 0;
    return 1 + getLevel(parent, visited);
  };

  // Assign levels
  skills.forEach((skill) => {
    const level = getLevel(skill);
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level)!.push(skill);
  });

  // Calculate positions
  const levelCount = levels.size;
  const verticalSpacing = Math.min(maxHeight / (levelCount + 1), 120);
  const horizontalPadding = nodeRadius * 2;

  levels.forEach((skillsAtLevel, levelIndex) => {
    const y = verticalSpacing * (levelIndex + 1);
    const levelWidth = Math.max(0, maxWidth - horizontalPadding * 2);
    const skillCount = skillsAtLevel.length;
    const desiredSpacing = 140;

    // Keep siblings inside the viewport while trying to preserve readable spacing.
    const horizontalSpacing =
      skillCount > 1 ? Math.min(desiredSpacing, levelWidth / (skillCount - 1)) : 0;
    const totalRowWidth = horizontalSpacing * Math.max(0, skillCount - 1);
    const rowStartX = (maxWidth - totalRowWidth) / 2;

    skillsAtLevel.forEach((skill, skillIndex) => {
      const x =
        skillCount === 1
          ? maxWidth / 2
          : rowStartX + horizontalSpacing * skillIndex;

      nodes.push({
        skillId: skill.id,
        x,
        y,
        radius: nodeRadius,
      });

      // Add connection to parent
      if (skill.parent_id) {
        connections.push({
          from: skill.parent_id,
          to: skill.id,
        });
      }
    });
  });

  return {
    nodes,
    connections,
    bounds: { width: maxWidth, height: maxHeight },
  };
};

/**
 * Calculate Euclidean distance between two points.
 */
export const calculateDistance = (
  from: { x: number; y: number },
  to: { x: number; y: number }
): number => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Generate SVG path for a connector line between two nodes.
 * Uses a smooth cubic Bezier curve.
 */
export const generateConnectorPath = (
  from: SkillNodePosition,
  to: SkillNodePosition
): string => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  // Control points for smooth curve (1/3 of the distance along the path)
  const controlOffsetX = dx * 0.33;
  const controlOffsetY = dy * 0.33;

  const x1 = from.x;
  const y1 = from.y + from.radius;
  const x2 = to.x;
  const y2 = to.y - to.radius;
  const cx1 = x1 + controlOffsetX;
  const cy1 = y1 + controlOffsetY;
  const cx2 = x2 - controlOffsetX;
  const cy2 = y2 - controlOffsetY;

  return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
};

/**
 * Calculate bounding box for all nodes to help with viewport sizing.
 */
export const calculateBounds = (
  nodes: SkillNodePosition[]
): { minX: number; minY: number; maxX: number; maxY: number } => {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach((node) => {
    minX = Math.min(minX, node.x - node.radius);
    minY = Math.min(minY, node.y - node.radius);
    maxX = Math.max(maxX, node.x + node.radius);
    maxY = Math.max(maxY, node.y + node.radius);
  });

  return { minX, minY, maxX, maxY };
};
