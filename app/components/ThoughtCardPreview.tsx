"use client";

import { type FormatConfig } from "../../lib/users";
import { FormatPill } from "./FormatPill";
import { formatDueDate } from "../../lib/format";
import { useAppStore } from "../../lib/store";
import { Lock, Users, Archive, ArchiveRestore, Trash2, RotateCcw } from "lucide-react";

interface ThoughtCardPreviewProps {
  data: Record<string, unknown>;
  formatMeta: Record<string, FormatConfig>;
  onClick?: () => void;
  className?: string;
  variant?: "saved" | "listed";
}

export function ThoughtCardPreview({ data, formatMeta, onClick, className, variant = "saved" }: ThoughtCardPreviewProps) {
  const tz = useAppStore(s => s.timezone);
  const saved = data.saved ? data : (data.thought as Record<string, unknown> | undefined);
  if (!saved) return null;
  const title = saved.title as string;
  const format = saved.format as string;
  const dueAt = (saved.due_at as string | null) ?? null;
  const visibility = (saved.visibility as string | undefined) ?? "team";
  const topics = (saved.topics as string[] | undefined) ?? [];
  const action = data.archived ? "archived" : data.unarchived ? "unarchived" : data.trashed ? "trashed" : data.restored ? "restored" : data.updated ? "updated" : "saved";

  const bannerConfig = {
    saved:    { label: "Saved",    color: visibility === "private" ? "#d97706" : "#3b82f6", Icon: visibility === "private" ? Lock : Users, suffix: ` as ${visibility === "private" ? "private" : "shared"}` },
    updated:  { label: "Updated",  color: visibility === "private" ? "#d97706" : "#3b82f6", Icon: visibility === "private" ? Lock : Users, suffix: ` as ${visibility === "private" ? "private" : "shared"}` },
    archived:   { label: "Archived",   color: "var(--text-secondary)", Icon: Archive,        suffix: "" },
    unarchived: { label: "Unarchived", color: "#22c55e",               Icon: ArchiveRestore, suffix: "" },
    trashed:    { label: "Trashed",    color: "var(--error)",          Icon: Trash2,         suffix: "" },
    restored:   { label: "Restored",   color: "#22c55e",               Icon: RotateCcw,      suffix: "" },
  } as const;

  const banner = bannerConfig[action];

  return (
    <div
      className={`rounded-xl overflow-hidden ${variant === "listed" ? "my-0.5" : "my-2 animate-fade-up"} ${className ?? ""}`}
      style={{ border: "1px solid var(--border-bright)" }}
    >
      {variant === "saved" && (
        <div
          className="px-3 py-1.5 flex items-center justify-between"
          style={{
            background: "var(--bg-subtle)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span
            className="text-[10px] font-bold tracking-[0.15em] uppercase flex items-center gap-1"
            style={{ color: banner.color }}
          >
            <banner.Icon size={9} />
            {banner.label}{banner.suffix}
          </span>
          {onClick && (
            <span
              className="text-[10px] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
              onClick={() => onClick()}
            >
              View in Thoughts →
            </span>
          )}
        </div>
      )}
      <div
        className="px-3 py-2.5 flex flex-col gap-1"
        style={{ background: "var(--highlight)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <span
            className="text-sm font-semibold line-clamp-2"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </span>
          {format && formatMeta[format] && <FormatPill meta={formatMeta[format]} variant="chat" />}
        </div>
        {topics.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {topics.map((t) => (
              <span
                key={t}
                className="text-[10px] font-medium rounded-full px-1.5 py-0.5"
                style={{ background: "var(--surface-hover)", color: "var(--accent)" }}
              >
                #{t}
              </span>
            ))}
          </div>
        )}
        {dueAt && (
          <span
            className="text-[11px] font-medium tabular-nums"
            style={{ color: "var(--text-secondary)" }}
          >
            {formatDueDate(dueAt, tz)}
          </span>
        )}
      </div>
    </div>
  );
}
