import type { CSSProperties } from "react";

// ─── Color Palette ───────────────────────────────────────────────────────────
// Each color slot defines pill/dot styles for dark and light themes.
// Formats reference a slot name (e.g. "rose") and we resolve it at read time.

export interface FormatStyles {
  pillStyle: CSSProperties;
  activePillStyle: CSSProperties;
  dotStyle: CSSProperties;
}

interface ColorSlotDef {
  dark: FormatStyles;
  light: FormatStyles;
}

const COLOR_PALETTE: Record<string, ColorSlotDef> = {
  rose: {
    dark: {
      pillStyle: { color: "var(--format-rose-text)", borderColor: "var(--format-rose-border)" },
      activePillStyle: { color: "var(--format-rose-text-active)", borderColor: "var(--format-rose-border-active)" },
      dotStyle: { background: "#fb7185", boxShadow: "0 0 5px rgba(251,113,133,0.5)" },
    },
    light: {
      pillStyle: { color: "var(--format-rose-text)", borderColor: "var(--format-rose-border)" },
      activePillStyle: { color: "var(--format-rose-text-active)", borderColor: "var(--format-rose-border-active)" },
      dotStyle: { background: "#e11d48", boxShadow: "0 0 5px rgba(225,29,72,0.4)" },
    },
  },
  amber: {
    dark: {
      pillStyle: { color: "var(--format-amber-text)", borderColor: "var(--format-amber-border)" },
      activePillStyle: { color: "var(--format-amber-text-active)", borderColor: "var(--format-amber-border-active)" },
      dotStyle: { background: "#f59e0b", boxShadow: "0 0 5px rgba(245,158,11,0.5)" },
    },
    light: {
      pillStyle: { color: "var(--format-amber-text)", borderColor: "var(--format-amber-border)" },
      activePillStyle: { color: "var(--format-amber-text-active)", borderColor: "var(--format-amber-border-active)" },
      dotStyle: { background: "#d97706", boxShadow: "0 0 5px rgba(217,119,6,0.4)" },
    },
  },
  emerald: {
    dark: {
      pillStyle: { color: "var(--format-emerald-text)", borderColor: "var(--format-emerald-border)" },
      activePillStyle: { color: "var(--format-emerald-text-active)", borderColor: "var(--format-emerald-border-active)" },
      dotStyle: { background: "#34d399", boxShadow: "0 0 5px rgba(52,211,153,0.5)" },
    },
    light: {
      pillStyle: { color: "var(--format-emerald-text)", borderColor: "var(--format-emerald-border)" },
      activePillStyle: { color: "var(--format-emerald-text-active)", borderColor: "var(--format-emerald-border-active)" },
      dotStyle: { background: "#059669", boxShadow: "0 0 5px rgba(5,150,105,0.4)" },
    },
  },
  orange: {
    dark: {
      pillStyle: { color: "var(--format-orange-text)", borderColor: "var(--format-orange-border)" },
      activePillStyle: { color: "var(--format-orange-text-active)", borderColor: "var(--format-orange-border-active)" },
      dotStyle: { background: "#fb923c", boxShadow: "0 0 5px rgba(251,146,60,0.5)" },
    },
    light: {
      pillStyle: { color: "var(--format-orange-text)", borderColor: "var(--format-orange-border)" },
      activePillStyle: { color: "var(--format-orange-text-active)", borderColor: "var(--format-orange-border-active)" },
      dotStyle: { background: "#ea580c", boxShadow: "0 0 5px rgba(234,88,12,0.4)" },
    },
  },
  cyan: {
    dark: {
      pillStyle: { color: "var(--format-cyan-text)", borderColor: "var(--format-cyan-border)" },
      activePillStyle: { color: "var(--format-cyan-text-active)", borderColor: "var(--format-cyan-border-active)" },
      dotStyle: { background: "#22d3ee", boxShadow: "0 0 5px rgba(34,211,238,0.5)" },
    },
    light: {
      pillStyle: { color: "var(--format-cyan-text)", borderColor: "var(--format-cyan-border)" },
      activePillStyle: { color: "var(--format-cyan-text-active)", borderColor: "var(--format-cyan-border-active)" },
      dotStyle: { background: "#0891b2", boxShadow: "0 0 5px rgba(8,145,178,0.4)" },
    },
  },
  violet: {
    dark: {
      pillStyle: { color: "var(--format-violet-text)", borderColor: "var(--format-violet-border)" },
      activePillStyle: { color: "var(--format-violet-text-active)", borderColor: "var(--format-violet-border-active)" },
      dotStyle: { background: "#a78bfa", boxShadow: "0 0 5px rgba(167,139,250,0.5)" },
    },
    light: {
      pillStyle: { color: "var(--format-violet-text)", borderColor: "var(--format-violet-border)" },
      activePillStyle: { color: "var(--format-violet-text-active)", borderColor: "var(--format-violet-border-active)" },
      dotStyle: { background: "#7c3aed", boxShadow: "0 0 5px rgba(124,58,237,0.4)" },
    },
  },
  sky: {
    dark: {
      pillStyle: { color: "var(--format-sky-text)", borderColor: "var(--format-sky-border)" },
      activePillStyle: { color: "var(--format-sky-text-active)", borderColor: "var(--format-sky-border-active)" },
      dotStyle: { background: "#38bdf8", boxShadow: "0 0 5px rgba(56,189,248,0.5)" },
    },
    light: {
      pillStyle: { color: "var(--format-sky-text)", borderColor: "var(--format-sky-border)" },
      activePillStyle: { color: "var(--format-sky-text-active)", borderColor: "var(--format-sky-border-active)" },
      dotStyle: { background: "#0284c7", boxShadow: "0 0 5px rgba(2,132,199,0.4)" },
    },
  },
  gray: {
    dark: {
      pillStyle: { color: "var(--text-muted)", borderColor: "var(--border-bright)" },
      activePillStyle: { color: "var(--text-secondary)", borderColor: "var(--text-muted)" },
      dotStyle: { background: "#777", boxShadow: "0 0 5px rgba(119,119,119,0.3)" },
    },
    light: {
      pillStyle: { color: "var(--text-muted)", borderColor: "var(--border-bright)" },
      activePillStyle: { color: "var(--text-secondary)", borderColor: "var(--text-muted)" },
      dotStyle: { background: "#6b7280", boxShadow: "0 0 5px rgba(107,114,128,0.3)" },
    },
  },
  // Additional slots for new user-created formats
  pink: {
    dark: {
      pillStyle: { color: "#f9a8d4", borderColor: "rgba(249,168,212,0.3)" },
      activePillStyle: { color: "#fbcfe8", borderColor: "rgba(251,207,232,0.5)" },
      dotStyle: { background: "#f472b6", boxShadow: "0 0 5px rgba(244,114,182,0.5)" },
    },
    light: {
      pillStyle: { color: "#be185d", borderColor: "rgba(190,24,93,0.3)" },
      activePillStyle: { color: "#9d174d", borderColor: "rgba(157,23,77,0.5)" },
      dotStyle: { background: "#db2777", boxShadow: "0 0 5px rgba(219,39,119,0.4)" },
    },
  },
  indigo: {
    dark: {
      pillStyle: { color: "#a5b4fc", borderColor: "rgba(165,180,252,0.3)" },
      activePillStyle: { color: "#c7d2fe", borderColor: "rgba(199,210,254,0.5)" },
      dotStyle: { background: "#818cf8", boxShadow: "0 0 5px rgba(129,140,248,0.5)" },
    },
    light: {
      pillStyle: { color: "#4338ca", borderColor: "rgba(67,56,202,0.3)" },
      activePillStyle: { color: "#3730a3", borderColor: "rgba(55,48,163,0.5)" },
      dotStyle: { background: "#6366f1", boxShadow: "0 0 5px rgba(99,102,241,0.4)" },
    },
  },
  teal: {
    dark: {
      pillStyle: { color: "#5eead4", borderColor: "rgba(94,234,212,0.3)" },
      activePillStyle: { color: "#99f6e4", borderColor: "rgba(153,246,228,0.5)" },
      dotStyle: { background: "#2dd4bf", boxShadow: "0 0 5px rgba(45,212,191,0.5)" },
    },
    light: {
      pillStyle: { color: "#0d9488", borderColor: "rgba(13,148,136,0.3)" },
      activePillStyle: { color: "#0f766e", borderColor: "rgba(15,118,110,0.5)" },
      dotStyle: { background: "#14b8a6", boxShadow: "0 0 5px rgba(20,184,166,0.4)" },
    },
  },
  lime: {
    dark: {
      pillStyle: { color: "#bef264", borderColor: "rgba(190,242,100,0.3)" },
      activePillStyle: { color: "#d9f99d", borderColor: "rgba(217,249,157,0.5)" },
      dotStyle: { background: "#a3e635", boxShadow: "0 0 5px rgba(163,230,53,0.5)" },
    },
    light: {
      pillStyle: { color: "#4d7c0f", borderColor: "rgba(77,124,15,0.3)" },
      activePillStyle: { color: "#3f6212", borderColor: "rgba(63,98,18,0.5)" },
      dotStyle: { background: "#84cc16", boxShadow: "0 0 5px rgba(132,204,22,0.4)" },
    },
  },
};

/** Get styles for a color slot. Falls back to gray if the slot is unknown. */
export function getFormatStyles(colorSlot: string, theme: "dark" | "light" = "dark"): FormatStyles {
  const slot = COLOR_PALETTE[colorSlot] ?? COLOR_PALETTE.gray;
  return slot[theme];
}
