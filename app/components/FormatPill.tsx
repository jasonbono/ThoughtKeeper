import { type FormatConfig } from "../../lib/users";

/**
 * Shared format pill badge used across Review and Chat views.
 *
 * Variants:
 *  - "compact"  — small text, active style, plural label
 *  - "chat"     — chat view (pill style, singular label, medium weight)
 *  - "filter"   — review filter bar (toggleable active/inactive, plural, transition)
 */
export function FormatPill({
  meta,
  active = true,
  variant = "filter",
  count,
}: {
  meta?: FormatConfig;
  active?: boolean;
  variant?: "compact" | "chat" | "filter";
  count?: number;
}) {
  if (!meta) return null;

  const activeStyle =
    variant === "chat"
      ? { ...meta.pillStyle, background: "var(--surface)" }
      : { ...meta.activePillStyle, background: "var(--pill-bg)" };

  const inactiveStyle = {
    borderColor: "var(--border)",
    background: "var(--pill-bg-muted)",
    color: "var(--text-muted)",
  };

  const className = [
    "inline-flex items-center gap-1.5 rounded-full border py-0.5 w-fit",
    variant === "compact"
      ? "px-2 text-[10px] font-semibold"
      : variant === "chat"
        ? "px-2 text-xs font-medium"
        : "px-2.5 text-xs font-semibold transition-all",
  ].join(" ");

  return (
    <span className={className} style={active ? activeStyle : inactiveStyle}>
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={active ? meta.dotStyle : { background: "var(--dot-inactive)" }}
      />
      {variant === "chat" ? meta.label : meta.labelPlural}
      {count !== undefined && (
        <span className="opacity-50 tabular-nums">{count}</span>
      )}
    </span>
  );
}
