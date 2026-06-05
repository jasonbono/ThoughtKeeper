import { type FormatConfig, DEFAULT_TIMEZONE } from "../../../lib/users";
import { toLocalDate } from "../../../lib/format";
import { type ThoughtRow } from "./types";

export function todayNY(tz = DEFAULT_TIMEZONE): string {
  return toLocalDate(new Date(), tz);
}

export function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDateHeading(dateStr: string, tz = DEFAULT_TIMEZONE): string {
  const today = todayNY(tz);
  if (dateStr === today) return "Today";
  const yesterday = shiftDate(today, -1);
  if (dateStr === yesterday) return "Yesterday";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Section { key: string; label: string; dot: any; rows: ThoughtRow[] }

export function buildSections({
  isSearching,
  showingArchived,
  viewMode,
  filtered,
  activeFormats,
  formatOrder,
  formatMetaMap,
  tz = DEFAULT_TIMEZONE,
}: {
  isSearching: boolean;
  showingArchived: boolean;
  viewMode: "chrono" | "format";
  filtered: ThoughtRow[];
  activeFormats: Set<string>;
  formatOrder: string[];
  formatMetaMap: Record<string, FormatConfig>;
  tz?: string;
}): Section[] {
  const sections: Section[] = [];

  if (isSearching) {
    // Search mode: flat section preserving RRF rank order, with format filter applied
    const searchFiltered = filtered.filter(c => activeFormats.has(c.format) || !new Set(formatOrder).has(c.format));
    if (searchFiltered.length > 0) {
      sections.push({ key: "search", label: `Results`, dot: null, rows: searchFiltered });
    }
  } else if (showingArchived || viewMode === "chrono") {
    // Chronological: group by date
    const itemsToGroup = showingArchived
      ? filtered
      : filtered.filter(c => activeFormats.has(c.format) || !new Set(formatOrder).has(c.format));
    const today = todayNY(tz);
    const yesterday = shiftDate(today, -1);
    for (const row of itemsToGroup) {
      const sortDate = row.updated_at ?? row.created_at;
      const dateKey = toLocalDate(new Date(sortDate), tz);
      const last = sections[sections.length - 1];
      if (last && last.key === dateKey) {
        last.rows.push(row);
      } else {
        sections.push({
          key: dateKey,
          label: dateKey === today ? "Today" : dateKey === yesterday ? "Yesterday" : formatDateHeading(dateKey, tz),
          dot: null,
          rows: [row],
        });
      }
    }
  } else {
    // Format mode: group by format
    const knownFormats = new Set<string>(formatOrder);
    for (const fmt of formatOrder) {
      if (!activeFormats.has(fmt)) continue;
      const rows = filtered.filter((c) => c.format === fmt);
      if (rows.length === 0) continue;
      if (fmt === "todo") {
        rows.sort((a, b) => {
          if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at);
          if (a.due_at) return -1;
          if (b.due_at) return 1;
          return 0;
        });
      }
      const meta = formatMetaMap[fmt];
      sections.push({
        key: fmt,
        label: meta ? meta.labelPlural : "Uncategorized",
        dot: meta ? meta.dotStyle : { background: "#888", boxShadow: "none" },
        rows,
      });
    }
    const uncategorized = filtered.filter((c) => !knownFormats.has(c.format));
    if (uncategorized.length > 0) {
      sections.push({
        key: "_uncategorized",
        label: "Uncategorized",
        dot: { background: "#888", boxShadow: "none" },
        rows: uncategorized,
      });
    }
  }

  return sections;
}
