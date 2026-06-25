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
  /** Extra vertical offset for the label, used to stagger dense rows. */
  labelDy?: number;
}

export interface TreeLayout {
  nodes: SkillNodePosition[];
  connections: Array<{ from: string; to: string }>;
  bounds: { width: number; height: number };
}

/**
 * Options for the dependency-layered layout. When `levelOf` is supplied the
 * layout places nodes in fixed rows (by dependency depth) and orders siblings to
 * sit under their parents, instead of the legacy parent-chain-depth packing.
 */
export interface LayeredLayoutOptions {
  levelOf: (skillId: string) => number;
  spacingX?: number;
  spacingY?: number;
}

/**
 * Calculate positions for skill nodes in a hierarchical tree layout.
 * Uses a simple level-based positioning algorithm:
 * - Root at center top
 * - Each level moves down
 * - Siblings spread horizontally
 *
 * When `options` is provided, switches to the dependency-layered algorithm
 * (rows by `levelOf`, barycenter sibling ordering, staggered labels).
 */
export const calculateTreeLayout = (
  skills: Skill[],
  maxWidth: number = 800,
  maxHeight: number = 600,
  options?: LayeredLayoutOptions
): TreeLayout => {
  if (options) {
    return layeredLayout(skills, options);
  }

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
 * Dependency-layered layout (Sugiyama-lite).
 *
 * Rows come from `levelOf` (the prerequisite depth), so foundations sit at the
 * top and advanced skills flow down. Within each row, nodes are ordered by the
 * barycenter (average position) of their parents/children over a few passes, so
 * children cluster beneath their prerequisites and edges rarely cross. Labels
 * alternate vertical offset to stop neighbouring captions overlapping.
 */
const layeredLayout = (
  skills: Skill[],
  options: LayeredLayoutOptions
): TreeLayout => {
  const nodeRadius = 28;
  const spacingX = options.spacingX ?? 160;
  const spacingY = options.spacingY ?? 158;

  // Bucket nodes by level.
  const byLevel = new Map<number, Skill[]>();
  let maxLevel = 0;
  skills.forEach((s) => {
    const level = Math.max(0, Math.round(options.levelOf(s.id)));
    maxLevel = Math.max(maxLevel, level);
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level)!.push(s);
  });

  // Stable initial order: cluster by category, then id.
  for (const arr of byLevel.values()) {
    arr.sort((a, b) =>
      a.category === b.category
        ? a.id < b.id
          ? -1
          : 1
        : a.category < b.category
          ? -1
          : 1
    );
  }

  // Index of each node within its row (kept in sync as we reorder).
  const pos = new Map<string, number>();
  const reindex = () => {
    for (const arr of byLevel.values()) arr.forEach((s, i) => pos.set(s.id, i));
  };
  reindex();

  const childrenOf = new Map<string, string[]>();
  skills.forEach((s) => {
    if (s.parent_id) {
      if (!childrenOf.has(s.parent_id)) childrenOf.set(s.parent_id, []);
      childrenOf.get(s.parent_id)!.push(s.id);
    }
  });

  const barycenter = (ids: string[]): number =>
    ids.length === 0
      ? Number.POSITIVE_INFINITY
      : ids.reduce((sum, id) => sum + (pos.get(id) ?? 0), 0) / ids.length;

  // Alternate downward (order by parents) and upward (order by children) sweeps.
  for (let pass = 0; pass < 6; pass++) {
    const down = pass % 2 === 0;
    const order = down
      ? Array.from({ length: maxLevel }, (_, i) => i + 1)
      : Array.from({ length: maxLevel }, (_, i) => maxLevel - 1 - i);
    for (const level of order) {
      const arr = byLevel.get(level);
      if (!arr) continue;
      arr.sort((a, b) => {
        const ba = down
          ? barycenter(a.parent_id ? [a.parent_id] : [])
          : barycenter(childrenOf.get(a.id) ?? []);
        const bb = down
          ? barycenter(b.parent_id ? [b.parent_id] : [])
          : barycenter(childrenOf.get(b.id) ?? []);
        if (ba !== bb) return ba - bb;
        return (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0);
      });
      reindex();
    }
  }

  // ---- x-coordinate assignment -------------------------------------------
  // Row *order* is fixed above; now assign real x so children cluster directly
  // *under* their parents instead of sitting on a rigid centered grid (which is
  // what made single children jump to the canvas centre and rows drift out of
  // alignment). Each node relaxes toward the barycenter of its neighbours, then
  // every row is de-overlapped (order preserved) and re-centred on that mass.
  const minGap = Math.max(spacingX, nodeRadius * 2 + 96);
  const xById = new Map<string, number>();
  for (const arr of byLevel.values()) {
    const rowWidth = (arr.length - 1) * minGap;
    arr.forEach((s, i) => xById.set(s.id, i * minGap - rowWidth / 2));
  }

  const mean = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

  const relaxLevel = (arr: Skill[], down: boolean) => {
    if (arr.length === 0) return;
    // Desired x = barycenter of parents (down sweep) or children (up sweep).
    const desired = arr.map((s) => {
      const neigh = down
        ? s.parent_id
          ? [s.parent_id]
          : []
        : childrenOf.get(s.id) ?? [];
      const xs = neigh
        .map((id) => xById.get(id))
        .filter((v): v is number => v !== undefined);
      return xs.length ? mean(xs) : xById.get(s.id)!;
    });
    arr.forEach((s, i) => xById.set(s.id, desired[i]));
    // De-overlap left-to-right, keeping the established order.
    for (let i = 1; i < arr.length; i++) {
      const prev = xById.get(arr[i - 1].id)!;
      if (xById.get(arr[i].id)! - prev < minGap) {
        xById.set(arr[i].id, prev + minGap);
      }
    }
    // Re-centre the row on the desired mass so it stays under its parents.
    const shift = mean(desired) - mean(arr.map((s) => xById.get(s.id)!));
    for (const s of arr) xById.set(s.id, xById.get(s.id)! + shift);
  };

  for (let pass = 0; pass < 12; pass++) {
    const down = pass % 2 === 0;
    const order = down
      ? Array.from({ length: maxLevel + 1 }, (_, i) => i)
      : Array.from({ length: maxLevel + 1 }, (_, i) => maxLevel - i);
    for (const level of order) relaxLevel(byLevel.get(level) ?? [], down);
  }

  // Normalise so the left-most node sits at a fixed margin, and size the canvas
  // to the real content extent (so long captions aren't clipped at the edges).
  const margin = spacingX;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  for (const x of xById.values()) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 0;
  }
  const offsetX = margin - minX;
  const canvasWidth = maxX - minX + margin * 2;

  const nodes: SkillNodePosition[] = [];
  const connections: Array<{ from: string; to: string }> = [];
  for (let level = 0; level <= maxLevel; level++) {
    const arr = byLevel.get(level);
    if (!arr) continue;
    const y = spacingY * 0.85 + level * spacingY;
    arr.forEach((s, i) => {
      nodes.push({
        skillId: s.id,
        x: xById.get(s.id)! + offsetX,
        y,
        radius: nodeRadius,
        // Stagger captions so dense rows don't collide horizontally.
        labelDy: arr.length > 1 ? (i % 2 === 0 ? 0 : 20) : 0,
      });
      if (s.parent_id) connections.push({ from: s.parent_id, to: s.id });
    });
  }

  const canvasHeight = spacingY * 0.85 + maxLevel * spacingY + spacingY;
  return { nodes, connections, bounds: { width: canvasWidth, height: canvasHeight } };
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
