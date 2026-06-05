import type { CSSProperties } from "react";
import { getFormatStyles } from "./palette";

// ─── Types ───────────────────────────────────────────────────────────────────

export type UserId = "alex" | "sam" | "jordan" | "taylor";

export type ThoughtFormat = "todo" | "capture";

export interface FormatConfig {
  id: ThoughtFormat;
  label: string;
  labelPlural: string;
  description: string;
  signals: string[];
  pillStyle: CSSProperties;
  activePillStyle: CSSProperties;
  dotStyle: CSSProperties;
}


export interface UserConfig {
  id: UserId;
  email: string;
  displayName: string;
  timezone: string;
}

// ─── 2-format capture system ────────────────────────────────────────────────

export const THOUGHT_FORMATS: FormatConfig[] = [
  {
    id: "todo",
    label: "To-do",
    labelPlural: "To-dos",
    description: "Action items — things to do, follow up on, or not forget.",
    signals: [],
    ...getFormatStyles("rose", "dark"),
  },
  {
    id: "capture",
    label: "Capture",
    labelPlural: "Captures",
    description: "Everything else — ideas, observations, decisions, notes, questions, and general thoughts.",
    signals: [],
    ...getFormatStyles("sky", "dark"),
  },
];

export const THOUGHT_FORMAT_IDS: ThoughtFormat[] = THOUGHT_FORMATS.map((t) => t.id);

// ─── Teams ───────────────────────────────────────────────────────────────────

export type TeamId = "acme" | "northwind";

export interface TeamConfig {
  id: TeamId;
  displayName: string;
  memberIds: UserId[];
}

export const TEAMS: Record<TeamId, TeamConfig> = {
  acme: {
    id: "acme",
    displayName: "Acme",
    memberIds: ["alex", "sam"],
  },
  northwind: {
    id: "northwind",
    displayName: "Northwind",
    memberIds: ["jordan", "taylor"],
  },
};

export const TEAM_IDS: TeamId[] = Object.keys(TEAMS) as TeamId[];

export function getTeamConfig(teamId: TeamId): TeamConfig {
  return TEAMS[teamId];
}

export function getTeamsForUser(userId: UserId): TeamConfig[] {
  return TEAM_IDS.map((id) => TEAMS[id]).filter((t) => t.memberIds.includes(userId));
}

export function getTeammateIds(teamId: TeamId, userId: UserId): UserId[] {
  return TEAMS[teamId].memberIds.filter((id) => id !== userId);
}

export function getTeamMemberIds(teamId: TeamId): UserId[] {
  return [...TEAMS[teamId].memberIds];
}

/** Returns all teammate IDs across all of a user's teams. */
export function getAllTeammateIds(userId: UserId): UserId[] {
  const teammates = new Set<UserId>();
  for (const team of getTeamsForUser(userId)) {
    for (const memberId of team.memberIds) {
      if (memberId !== userId) teammates.add(memberId);
    }
  }
  return [...teammates];
}

/** True if two users share at least one team. */
export function areTeammates(a: UserId, b: UserId): boolean {
  return TEAM_IDS.some((id) => TEAMS[id].memberIds.includes(a) && TEAMS[id].memberIds.includes(b));
}

// ─── Per-user configuration ──────────────────────────────────────────────────

export const DEFAULT_TIMEZONE = "America/New_York";

export const USERS: Record<UserId, UserConfig> = {
  alex: {
    id: "alex",
    email: "alex@example.com",
    displayName: "Alex",
    timezone: DEFAULT_TIMEZONE,
  },
  sam: {
    id: "sam",
    email: "sam@example.com",
    displayName: "Sam",
    timezone: DEFAULT_TIMEZONE,
  },
  jordan: {
    id: "jordan",
    email: "jordan@example.com",
    displayName: "Jordan",
    timezone: DEFAULT_TIMEZONE,
  },
  taylor: {
    id: "taylor",
    email: "taylor@example.com",
    displayName: "Taylor",
    timezone: DEFAULT_TIMEZONE,
  },
};

// ─── Per-user visual themes (applied via JS — no CSS attribute selectors) ────

export interface UserTheme {
  glowBg: string;
  glowStyle?: CSSProperties;
  shimmerBg: string;
  vars: Record<string, string>;
}

// ─── Color themes (decoupled from users) ─────────────────────────────────────

export type ColorTheme = "pink" | "mint" | "plain" | "sunset" | "sky" | "clouds";
export const COLOR_THEME_IDS: ColorTheme[] = ["pink", "mint", "plain", "sunset", "sky", "clouds"];
export const DEFAULT_COLOR_THEME: ColorTheme = "pink";

export const COLOR_THEME_LABELS: Record<ColorTheme, string> = {
  pink: "Pink",
  mint: "Mint",
  plain: "Plain",
  sunset: "Sunset",
  sky: "Sky",
  clouds: "Clouds",
};

/** Dark-mode color themes. */
export const COLOR_THEMES_DARK: Record<ColorTheme, UserTheme> = {
  mint: {
    glowBg: "radial-gradient(ellipse at center, rgba(80,220,165,0.10) 0%, rgba(177,140,254,0.05) 25%, rgba(88,166,255,0.03) 45%, transparent 70%)",
    shimmerBg: "linear-gradient(135deg, #f5f0e8 0%, #b18cfe 20%, #58a6ff 40%, #50dca5 60%, #ffa657 80%, #f778ba 100%)",

    vars: {
      "--accent": "#50dca5",
      "--accent-dim": "rgba(80, 220, 165, 0.15)",
      "--highlight": "rgba(80, 220, 165, 0.06)",
      "--user-bubble-bg": "rgba(80, 220, 165, 0.08)",
      "--user-bubble-border": "rgba(80, 220, 165, 0.15)",
      "--focus-color": "rgba(80, 220, 165, 0.5)",
      "--input-focus-border": "rgba(80, 220, 165, 0.3)",
      "--input-focus-glow": "rgba(80, 220, 165, 0.07)",
    },
  },
  pink: {
    glowBg: "radial-gradient(ellipse at center, rgba(244,114,182,0.10) 0%, rgba(177,140,254,0.05) 25%, rgba(251,146,60,0.03) 45%, transparent 70%)",
    shimmerBg: "linear-gradient(135deg, #f5f0e8 0%, #f472b6 20%, #b18cfe 40%, #ffa657 60%, #58a6ff 80%, #f9a8d4 100%)",

    vars: {
      "--accent": "#f472b6",
      "--accent-dim": "rgba(244, 114, 182, 0.15)",
      "--highlight": "rgba(244, 114, 182, 0.06)",
      "--user-bubble-bg": "rgba(244, 114, 182, 0.08)",
      "--user-bubble-border": "rgba(244, 114, 182, 0.15)",
      "--focus-color": "rgba(244, 114, 182, 0.5)",
      "--input-focus-border": "rgba(244, 114, 182, 0.3)",
      "--input-focus-glow": "rgba(244, 114, 182, 0.07)",
    },
  },
  plain: {
    glowBg: "radial-gradient(ellipse at center, rgba(180,180,190,0.08) 0%, rgba(160,160,170,0.04) 25%, rgba(140,140,150,0.02) 45%, transparent 70%)",
    shimmerBg: "linear-gradient(135deg, #f5f0e8 0%, #a0a0aa 20%, #c0c0c8 40%, #888890 60%, #b0b0b8 80%, #d0d0d8 100%)",

    vars: {
      "--accent": "#a0a0aa",
      "--accent-dim": "rgba(160, 160, 170, 0.15)",
      "--highlight": "rgba(160, 160, 170, 0.06)",
      "--user-bubble-bg": "rgba(160, 160, 170, 0.08)",
      "--user-bubble-border": "rgba(160, 160, 170, 0.15)",
      "--focus-color": "rgba(160, 160, 170, 0.5)",
      "--input-focus-border": "rgba(160, 160, 170, 0.3)",
      "--input-focus-glow": "rgba(160, 160, 170, 0.07)",
    },
  },
  sunset: {
    glowBg: "url('/sunset.jpg') center/cover no-repeat",
    glowStyle: { filter: "blur(50px) saturate(1.2)" },
    shimmerBg: "linear-gradient(135deg, #fef3c7 0%, #f97316 20%, #ec4899 40%, #8b5cf6 60%, #f59e0b 80%, #f472b6 100%)",

    vars: {
      "--accent": "#f97316",
      "--accent-dim": "rgba(249, 115, 22, 0.15)",
      "--highlight": "rgba(249, 115, 22, 0.06)",
      "--user-bubble-bg": "rgba(249, 115, 22, 0.08)",
      "--user-bubble-border": "rgba(249, 115, 22, 0.15)",
      "--focus-color": "rgba(249, 115, 22, 0.5)",
      "--input-focus-border": "rgba(249, 115, 22, 0.3)",
      "--input-focus-glow": "rgba(249, 115, 22, 0.07)",
    },
  },
  sky: {
    glowBg: "url('/sky.jpg') center/cover no-repeat",
    glowStyle: { filter: "blur(50px) saturate(1.2)" },
    shimmerBg: "linear-gradient(135deg, #f5f0e8 0%, #a855f7 20%, #ec4899 40%, #7c3aed 60%, #f472b6 80%, #c084fc 100%)",

    vars: {
      "--accent": "#a855f7",
      "--accent-dim": "rgba(168, 85, 247, 0.15)",
      "--highlight": "rgba(168, 85, 247, 0.06)",
      "--user-bubble-bg": "rgba(168, 85, 247, 0.08)",
      "--user-bubble-border": "rgba(168, 85, 247, 0.15)",
      "--focus-color": "rgba(168, 85, 247, 0.5)",
      "--input-focus-border": "rgba(168, 85, 247, 0.3)",
      "--input-focus-glow": "rgba(168, 85, 247, 0.07)",
    },
  },
  clouds: {
    glowBg: "url('/clouds.jpg') center/cover no-repeat",
    glowStyle: { filter: "blur(50px) saturate(1.2)" },
    shimmerBg: "linear-gradient(135deg, #f5f0e8 0%, #38bdf8 20%, #f59e0b 40%, #7dd3fc 60%, #fbbf24 80%, #93c5fd 100%)",

    vars: {
      "--accent": "#38bdf8",
      "--accent-dim": "rgba(56, 189, 248, 0.15)",
      "--highlight": "rgba(56, 189, 248, 0.06)",
      "--user-bubble-bg": "rgba(56, 189, 248, 0.08)",
      "--user-bubble-border": "rgba(56, 189, 248, 0.15)",
      "--focus-color": "rgba(56, 189, 248, 0.5)",
      "--input-focus-border": "rgba(56, 189, 248, 0.3)",
      "--input-focus-glow": "rgba(56, 189, 248, 0.07)",
    },
  },
};

/** Light-mode color themes. */
export const COLOR_THEMES_LIGHT: Record<ColorTheme, UserTheme> = {
  mint: {
    glowBg: "radial-gradient(ellipse at center, rgba(26,153,96,0.18) 0%, rgba(139,92,246,0.10) 25%, rgba(14,165,233,0.06) 45%, transparent 70%)",
    shimmerBg: "linear-gradient(135deg, #374151 0%, #7c3aed 20%, #0369a1 40%, #059669 60%, #d97706 80%, #db2777 100%)",

    vars: {
      "--accent": "#1a9960",
      "--accent-dim": "rgba(26, 153, 96, 0.12)",
      "--highlight": "rgba(26, 153, 96, 0.05)",
      "--user-bubble-bg": "rgba(26, 153, 96, 0.07)",
      "--user-bubble-border": "rgba(26, 153, 96, 0.18)",
      "--focus-color": "rgba(26, 153, 96, 0.5)",
      "--input-focus-border": "rgba(26, 153, 96, 0.4)",
      "--input-focus-glow": "rgba(26, 153, 96, 0.1)",
    },
  },
  pink: {
    glowBg: "radial-gradient(ellipse at center, rgba(219,39,119,0.18) 0%, rgba(139,92,246,0.10) 25%, rgba(251,146,60,0.06) 45%, transparent 70%)",
    shimmerBg: "linear-gradient(135deg, #374151 0%, #db2777 20%, #7c3aed 40%, #d97706 60%, #0369a1 80%, #ec4899 100%)",

    vars: {
      "--accent": "#db2777",
      "--accent-dim": "rgba(219, 39, 119, 0.12)",
      "--highlight": "rgba(219, 39, 119, 0.05)",
      "--user-bubble-bg": "rgba(219, 39, 119, 0.07)",
      "--user-bubble-border": "rgba(219, 39, 119, 0.18)",
      "--focus-color": "rgba(219, 39, 119, 0.5)",
      "--input-focus-border": "rgba(219, 39, 119, 0.4)",
      "--input-focus-glow": "rgba(219, 39, 119, 0.1)",
    },
  },
  plain: {
    glowBg: "radial-gradient(ellipse at center, rgba(107,114,128,0.12) 0%, rgba(75,85,99,0.06) 25%, rgba(55,65,81,0.03) 45%, transparent 70%)",
    shimmerBg: "linear-gradient(135deg, #374151 0%, #6b7280 20%, #4b5563 40%, #9ca3af 60%, #6b7280 80%, #374151 100%)",

    vars: {
      "--accent": "#6b7280",
      "--accent-dim": "rgba(107, 114, 128, 0.12)",
      "--highlight": "rgba(107, 114, 128, 0.05)",
      "--user-bubble-bg": "rgba(107, 114, 128, 0.07)",
      "--user-bubble-border": "rgba(107, 114, 128, 0.18)",
      "--focus-color": "rgba(107, 114, 128, 0.5)",
      "--input-focus-border": "rgba(107, 114, 128, 0.4)",
      "--input-focus-glow": "rgba(107, 114, 128, 0.1)",
    },
  },
  sunset: {
    glowBg: "url('/sunset.jpg') center/cover no-repeat",
    glowStyle: { filter: "blur(50px) saturate(1.0)" },
    shimmerBg: "linear-gradient(135deg, #374151 0%, #ea580c 20%, #db2777 40%, #7c3aed 60%, #d97706 80%, #ec4899 100%)",

    vars: {
      "--accent": "#ea580c",
      "--accent-dim": "rgba(234, 88, 12, 0.12)",
      "--highlight": "rgba(234, 88, 12, 0.05)",
      "--user-bubble-bg": "rgba(234, 88, 12, 0.07)",
      "--user-bubble-border": "rgba(234, 88, 12, 0.18)",
      "--focus-color": "rgba(234, 88, 12, 0.5)",
      "--input-focus-border": "rgba(234, 88, 12, 0.4)",
      "--input-focus-glow": "rgba(234, 88, 12, 0.1)",
    },
  },
  sky: {
    glowBg: "url('/sky.jpg') center/cover no-repeat",
    glowStyle: { filter: "blur(50px) saturate(1.0)" },
    shimmerBg: "linear-gradient(135deg, #374151 0%, #7c3aed 20%, #db2777 40%, #6d28d9 60%, #ec4899 80%, #9333ea 100%)",

    vars: {
      "--accent": "#7c3aed",
      "--accent-dim": "rgba(124, 58, 237, 0.12)",
      "--highlight": "rgba(124, 58, 237, 0.05)",
      "--user-bubble-bg": "rgba(124, 58, 237, 0.07)",
      "--user-bubble-border": "rgba(124, 58, 237, 0.18)",
      "--focus-color": "rgba(124, 58, 237, 0.5)",
      "--input-focus-border": "rgba(124, 58, 237, 0.4)",
      "--input-focus-glow": "rgba(124, 58, 237, 0.1)",
    },
  },
  clouds: {
    glowBg: "url('/clouds.jpg') center/cover no-repeat",
    glowStyle: { filter: "blur(50px) saturate(1.0)" },
    shimmerBg: "linear-gradient(135deg, #374151 0%, #0284c7 20%, #d97706 40%, #0369a1 60%, #b45309 80%, #0ea5e9 100%)",

    vars: {
      "--accent": "#0284c7",
      "--accent-dim": "rgba(2, 132, 199, 0.12)",
      "--highlight": "rgba(2, 132, 199, 0.05)",
      "--user-bubble-bg": "rgba(2, 132, 199, 0.07)",
      "--user-bubble-border": "rgba(2, 132, 199, 0.18)",
      "--focus-color": "rgba(2, 132, 199, 0.5)",
      "--input-focus-border": "rgba(2, 132, 199, 0.4)",
      "--input-focus-glow": "rgba(2, 132, 199, 0.1)",
    },
  },
};

/** Apply a color theme's CSS variables to the document root. */
export function applyColorTheme(colorTheme?: ColorTheme): UserTheme {
  const mode = document.documentElement.getAttribute("data-theme") || "dark";
  const ct = colorTheme || (localStorage.getItem("colorTheme") as ColorTheme) || DEFAULT_COLOR_THEME;
  const resolved = mode === "light" ? COLOR_THEMES_LIGHT[ct] : COLOR_THEMES_DARK[ct];
  const el = document.documentElement;
  // Clear theme-specific vars that only some themes set, so they fall back
  // to CSS defaults when switching to a theme that doesn't set them.
  el.style.removeProperty("--glow-opacity");
  for (const [prop, value] of Object.entries(resolved.vars)) {
    el.style.setProperty(prop, value);
  }
  return resolved;
}

// ─── Helper functions ────────────────────────────────────────────────────────

export const USER_IDS: UserId[] = ["alex", "sam", "jordan", "taylor"];
export const DEFAULT_USER: UserId = "alex";

/** User with access to the admin-only feature-request list. */
export const ADMIN_USER: UserId = "alex";

export function getUserConfig(userId: UserId): UserConfig {
  return USERS[userId];
}

export function getFormatMeta(): Record<string, FormatConfig> {
  return Object.fromEntries(THOUGHT_FORMATS.map((t) => [t.id, t]));
}

export function getFormatOrder(): string[] {
  return [...THOUGHT_FORMAT_IDS];
}

/** Coerce an untrusted format string to a valid format, falling back to "capture". */
export function coerceFormat(value: string | null | undefined): ThoughtFormat {
  if (value && THOUGHT_FORMAT_IDS.includes(value as ThoughtFormat)) return value as ThoughtFormat;
  return "capture";
}

/** Map of email addresses to user IDs, built from USERS config. */
const EMAIL_TO_USER: Record<string, UserId> = Object.fromEntries(
  USER_IDS.map((id) => [USERS[id].email, id])
);

/** Look up a UserId by email. Returns null if not a known user. */
export function getUserIdByEmail(email: string | null | undefined): UserId | null {
  if (!email) return null;
  return EMAIL_TO_USER[email.toLowerCase()] ?? null;
}

/** Validate a string as a UserId. Returns DEFAULT_USER for invalid values. */
export function validateUserId(value: string | null | undefined): UserId {
  if (value && USER_IDS.includes(value as UserId)) return value as UserId;
  return DEFAULT_USER;
}

/** Strict validation — returns null instead of silently defaulting. */
export function validateUserIdStrict(value: string | null | undefined): UserId | null {
  if (value && USER_IDS.includes(value as UserId)) return value as UserId;
  return null;
}
