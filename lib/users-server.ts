/**
 * Server-only user functions.
 * Do NOT import this file from client components — it requires better-sqlite3.
 *
 * This file re-exports the shared types and provides getUserConfig.
 */

import type { UserId, FormatConfig } from "./users";
import { THOUGHT_FORMATS, THOUGHT_FORMAT_IDS, USERS } from "./users";

// Re-export everything server code needs
export type { UserId, FormatConfig } from "./users";
export {
  USER_IDS,
  DEFAULT_USER,
  validateUserId,
  validateUserIdStrict,
  getUserIdByEmail,
  THOUGHT_FORMATS,
  THOUGHT_FORMAT_IDS,
  coerceFormat,
  getFormatMeta,
  getFormatOrder,
  // Team helpers
  TEAMS,
  TEAM_IDS,
  getTeamConfig,
  getTeamsForUser,
  getTeammateIds,
  getTeamMemberIds,
  getAllTeammateIds,
  areTeammates,
} from "./users";
export type { TeamId, TeamConfig } from "./users";

// ─── Format accessors ───────────────────────────────────────────────────────

export function getAllFormats(): FormatConfig[] {
  return THOUGHT_FORMATS;
}

export function getValidFormatIds(): Set<string> {
  return new Set(THOUGHT_FORMAT_IDS);
}

export function getUserConfig(userId: UserId) {
  const user = USERS[userId];
  return { ...user, formats: THOUGHT_FORMATS };
}
