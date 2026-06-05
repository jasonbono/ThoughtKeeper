import { DEFAULT_TIMEZONE } from "./users";

export function formatDueDate(iso: string, tz = DEFAULT_TIMEZONE): string {
  const d = new Date(iso);
  const hasTime = !iso.includes("T00:00:00");
  const datePart = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: tz,
  });
  if (!hasTime) return `Due ${datePart}`;
  const timePart = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
  return `Due ${datePart} · ${timePart}`;
}

export function formatDateTime(iso: string, tz = DEFAULT_TIMEZONE): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: tz,
  });
  const timePart = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
  return `${datePart} · ${timePart}`;
}

export function formatDateShort(iso: string, tz = DEFAULT_TIMEZONE): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: tz,
  });
}

/** YYYY-MM-DD in the given timezone. */
export function toLocalDate(d: Date, tz = DEFAULT_TIMEZONE): string {
  return d.toLocaleDateString("en-CA", { timeZone: tz });
}

/** @deprecated Use toLocalDate instead. */
export const toNyDate = toLocalDate;

/** Current wall-clock in the given timezone, formatted for an LLM prompt. */
export function nowForPrompt(tz = DEFAULT_TIMEZONE): string {
  return new Date().toLocaleString("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** @deprecated Use nowForPrompt instead. */
export const nowNyForPrompt = nowForPrompt;

/** Short timezone label for prompts, e.g. "EST", "PDT", "CST". */
export function tzAbbrev(tz = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "short",
  }).formatToParts(new Date());
  return parts.find(p => p.type === "timeZoneName")?.value ?? tz;
}

/**
 * Parse a loose date/time string (assumed in the given timezone) into ISO 8601 with offset.
 * Accepts: "2026-03-21 09:00", "2026-3-21 9:00", "2026/03/21 09:00",
 *          "2026-03-21T09:00:00", "2026-03-21" (defaults to 09:00).
 * Returns null if unparseable or invalid.
 */
export function parseDueAt(input: string | null | undefined, tz = DEFAULT_TIMEZONE): string | null {
  if (!input || input === "null") return null;
  const s = input.trim();
  if (!s) return null;

  const match = s.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const hour = match[4] !== undefined ? parseInt(match[4], 10) : 9;
  const minute = match[5] !== undefined ? parseInt(match[5], 10) : 0;
  const second = 0; // seconds not supported — hour:minute granularity only

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  // Validate actual date (catches Feb 30, etc.)
  const test = new Date(year, month - 1, day);
  if (test.getFullYear() !== year || test.getMonth() !== month - 1 || test.getDate() !== day) return null;

  // Determine timezone offset using probe technique
  const probeMs = Date.UTC(year, month - 1, day, hour + 5, minute, second);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(probeMs));
  const g = (t: string) => +(parts.find(p => p.type === t)?.value ?? "0");
  const localMs = Date.UTC(g("year"), g("month") - 1, g("day"),
    g("hour") === 24 ? 0 : g("hour"), g("minute"), g("second"));
  const offsetMin = (probeMs - localMs) / 60000;
  const offsetH = Math.floor(Math.abs(offsetMin) / 60);
  const offsetM = Math.abs(offsetMin) % 60;
  const sign = offsetMin > 0 ? "-" : "+";

  const p = (n: number) => String(n).padStart(2, "0");
  return `${year}-${p(month)}-${p(day)}T${p(hour)}:${p(minute)}:${p(second)}${sign}${p(offsetH)}:${p(offsetM)}`;
}
