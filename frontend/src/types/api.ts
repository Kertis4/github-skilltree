/**
 * TypeScript interfaces for GitHub SkillTree API responses.
 * These match the backend API contract defined in the hackathon README.
 */

/**
 * Core skill node in the skill tree.
 * Represents a single skill with XP, level, and evidence.
 */
export interface Skill {
  id: string;
  name: string;
  category: 'Languages' | 'Paradigms' | 'Tooling & DevOps' | 'Code Quality';
  xp: number;
  level: number;
  parent_id?: string | null;
  evidence?: string[];
  description?: string;
}

/**
 * Radar chart data — proficiency across 4 skill categories.
 * Values are typically 0-100 (percentile or XP-based score).
 */
export interface RadarData {
  Languages: number;
  Paradigms: number;
  Tooling: number;
  Quality: number;
}

/**
 * Learning quest / recommendation for the user.
 * Suggests either deepening an existing skill or expanding to adjacent one.
 */
export interface Quest {
  skill: string; // skill id or name
  type: 'deepen' | 'expand';
  title: string;
  description?: string;
  steps?: string[];
  resources?: string[];
}

/**
 * User profile — the complete response from GET /me/profile.
 */
export interface UserProfile {
  user: string; // GitHub login
  totalXp: number;
  radar: RadarData;
  skills: Skill[];
  quests?: Quest[];
}

/**
 * GitHub repository metadata (for context, minimal for now).
 */
export interface Repository {
  id: string;
  name: string;
  url?: string;
  language?: string;
}

/**
 * User account info (for context).
 */
export interface User {
  id: string;
  github_login: string;
  email?: string;
  avatar_url?: string;
  last_analyzed?: Date;
}
