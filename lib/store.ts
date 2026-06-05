import { create } from "zustand";
import type { Screen, CaptureMode } from "./types";
import type { UserId, UserTheme } from "./users";
import { COLOR_THEMES_DARK, DEFAULT_COLOR_THEME, DEFAULT_TIMEZONE } from "./users";

// ── URL ↔ Screen mapping ────────────────────────────────────────────────────

const SCREEN_TO_PATH: Record<Screen, string> = {
  settings: "/settings",
  voice: "/voice",
  pulse: "/pulse",
  chat: "/chat",
  templates: "/templates",
  captures: "/review",
};

const PATH_TO_SCREEN: Record<string, Screen> = {
  "/": "voice",
  "/voice": "voice",
  "/notes": "voice",
  "/pulse": "pulse",
  "/chat": "chat",
  "/templates": "templates",
  "/review": "captures",
  "/settings": "settings",
};

/** Resolve a pathname to a Screen, defaulting to "voice". */
export function pathToScreen(pathname: string): Screen {
  return PATH_TO_SCREEN[pathname] ?? "voice";
}

/** Get the URL path for a screen. */
export function screenToPath(screen: Screen): string {
  return SCREEN_TO_PATH[screen];
}

// ── Store ────────────────────────────────────────────────────────────────────

interface AppState {
  // Auth
  userId: UserId | null;
  setUserId: (id: UserId | null) => void;

  // Navigation
  screen: Screen;
  navigateTo: (screen: Screen) => void;
  /** Set screen from a URL path (used on mount and popstate — no pushState). */
  syncFromPath: (pathname: string) => void;
  refreshKey: number;

  // Theme
  theme: UserTheme;
  setTheme: (theme: UserTheme) => void;

  // Timezone
  timezone: string;
  setTimezone: (tz: string) => void;

  // Capture mode
  captureMode: CaptureMode;
  setCaptureMode: (mode: CaptureMode) => void;

  // Cross-view: highlight a thought in ReviewView
  highlightThoughtId: string | null;
  setHighlightThoughtId: (id: string | null) => void;

  // Cross-view: pass last note thought to ChatView
  lastNoteThought: { id: string; data: Record<string, unknown> } | null;
  setLastNoteThought: (thought: { id: string; data: Record<string, unknown> } | null) => void;

}

export const useAppStore = create<AppState>((set) => ({
  userId: null,
  setUserId: (userId) => set({ userId }),

  screen: "voice",
  refreshKey: 0,
  navigateTo: (screen) => {
    const path = SCREEN_TO_PATH[screen];
    history.pushState(null, "", path);
    set((state) => ({
      screen,
      refreshKey: screen === "captures" ? state.refreshKey + 1 : state.refreshKey,
    }));
  },
  syncFromPath: (pathname) =>
    set((state) => {
      const screen = PATH_TO_SCREEN[pathname] ?? "voice";
      return {
        screen,
        refreshKey: screen === "captures" ? state.refreshKey + 1 : state.refreshKey,
      };
    }),

  theme: COLOR_THEMES_DARK[DEFAULT_COLOR_THEME],
  setTheme: (theme) => set({ theme }),

  timezone: DEFAULT_TIMEZONE,
  setTimezone: (timezone) => set({ timezone }),

  captureMode: "private",
  setCaptureMode: (captureMode) => {
    localStorage.setItem("captureMode", captureMode);
    set({ captureMode });
  },

  highlightThoughtId: null,
  setHighlightThoughtId: (highlightThoughtId) => set({ highlightThoughtId }),

  lastNoteThought: null,
  setLastNoteThought: (lastNoteThought) => set({ lastNoteThought }),
}));
