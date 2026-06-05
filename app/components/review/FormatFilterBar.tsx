"use client";

import { useRef, useEffect } from "react";
import { type FormatConfig } from "../../../lib/users";
import { FormatPill } from "../FormatPill";

interface Props {
  formatOrder: string[];
  formatMetaMap: Record<string, FormatConfig>;
  activeFormats: Set<string>;
  formatCounts: Map<string, number>;
  onSoloFormat: (format: string) => void;
  onDragToggleFormat: (format: string) => void;
  onResetFormats: () => void;
}

export function FormatFilterBar({
  formatOrder,
  formatMetaMap,
  activeFormats,
  formatCounts,
  onSoloFormat,
  onDragToggleFormat,
  onResetFormats,
}: Props) {
  const dragRef = useRef<"activate" | "deactivate" | null>(null);
  const didDragRef = useRef(false);
  const dragStartFormat = useRef<string | null>(null);

  function handleEnd() {
    if (!didDragRef.current && dragStartFormat.current) {
      onSoloFormat(dragStartFormat.current);
    }
    dragRef.current = null;
    didDragRef.current = false;
    dragStartFormat.current = null;
  }

  // Clear drag state on global mouseup; apply solo if no drag occurred
  useEffect(() => {
    const handleMouseUp = () => {
      handleEnd();
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [formatOrder]);

  return (
    <div className="flex gap-2 flex-wrap items-center select-none"
      onMouseUp={handleEnd}
      onTouchEnd={handleEnd}
      onTouchMove={(e) => {
        if (!dragRef.current) return;
        const touch = e.touches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const btn = el?.closest("[data-format]") as HTMLElement | null;
        if (!btn) return;
        const formatId = btn.dataset.format;
        if (!formatId) return;
        // First drag movement: apply toggle to the starting pill
        if (!didDragRef.current && dragStartFormat.current) {
          didDragRef.current = true;
          onDragToggleFormat(dragStartFormat.current);
        }
        const isActive = activeFormats.has(formatId);
        if (dragRef.current === "activate" && !isActive) onDragToggleFormat(formatId);
        if (dragRef.current === "deactivate" && isActive) onDragToggleFormat(formatId);
      }}
    >
      {formatOrder.map((b) => {
        const active = activeFormats.has(b);
        const meta = formatMetaMap[b];
        if (!meta) return null;
        return (
          <button
            key={b}
            data-format={b}
            onMouseDown={(e) => {
              e.preventDefault();
              didDragRef.current = false;
              dragStartFormat.current = b;
              dragRef.current = active ? "deactivate" : "activate";
            }}
            onMouseEnter={() => {
              if (!dragRef.current) return;
              // First drag movement: switch from solo intent to drag-toggle mode
              if (!didDragRef.current && dragStartFormat.current) {
                didDragRef.current = true;
                onDragToggleFormat(dragStartFormat.current);
              }
              if (dragRef.current === "activate" && !active) onDragToggleFormat(b);
              if (dragRef.current === "deactivate" && active) onDragToggleFormat(b);
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              didDragRef.current = false;
              dragStartFormat.current = b;
              dragRef.current = active ? "deactivate" : "activate";
            }}
            className="format-pill-btn cursor-pointer"
            aria-label={`${active ? "Hide" : "Show"} ${meta.labelPlural}`}
          >
            <FormatPill active={active} meta={meta} variant="filter" count={formatCounts.get(b) ?? 0} />
          </button>
        );
      })}
      <span className="text-[10px] ml-1">
        <button
          onClick={onResetFormats}
          className="cursor-pointer hover:underline"
          style={{ color: activeFormats.size === formatOrder.length ? "var(--accent)" : "var(--text-muted)" }}
        >
          All
        </button>
      </span>
    </div>
  );
}
