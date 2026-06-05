"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { todayNY } from "./buildSections";

interface Props {
  selectedDate: string | null;
  onNavigate: (direction: -1 | 1) => void;
  onReset: () => void;
}

export function DateNavigator({ selectedDate, onNavigate, onReset }: Props) {
  const isToday = !selectedDate || selectedDate === todayNY();

  return (
    <div className="flex items-center gap-3 animate-fade-up">
      <button
        onClick={() => onNavigate(-1)}
        className="date-nav-btn p-1.5 rounded-lg transition-colors duration-150 cursor-pointer"
        style={{ background: "var(--surface)", color: "var(--text-secondary)" }}
        aria-label="Previous day"
      >
        <ChevronLeft size={14} strokeWidth={1.5} />
      </button>

      <span className="text-xs font-medium tabular-nums" style={{ color: "var(--text-secondary)" }}>
        {selectedDate ?? todayNY()}
      </span>

      <button
        onClick={() => { if (!isToday) onNavigate(1); }}
        disabled={isToday}
        className="date-nav-btn p-1.5 rounded-lg transition-colors duration-150 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
        style={{ background: "var(--surface)", color: "var(--text-secondary)" }}
        aria-label="Next day"
      >
        <ChevronRight size={14} strokeWidth={1.5} />
      </button>

      {selectedDate && (
        <button
          onClick={onReset}
          className="text-xs font-medium px-2 py-0.5 rounded-md transition-colors duration-150 cursor-pointer"
          style={{ background: "var(--surface)", color: "var(--accent)" }}
        >
          Show all
        </button>
      )}
    </div>
  );
}
