"use client";

interface Props {
  viewMode: "chrono" | "format";
  onModeChange: (mode: "chrono" | "format") => void;
}

export function ViewModeToggle({ viewMode, onModeChange }: Props) {
  return (
    <div className="flex items-center gap-3 animate-fade-up">
      <div
        className="flex items-center rounded-full p-0.5 text-[11px] font-semibold"
        style={{ background: "var(--surface)", border: "1px solid var(--border-bright)" }}
      >
        <button
          onClick={() => onModeChange("chrono")}
          className="px-2.5 py-1 rounded-full transition-all duration-200 cursor-pointer"
          style={{
            background: viewMode === "chrono" ? "var(--surface-hover)" : "transparent",
            color: viewMode === "chrono" ? "var(--text-primary)" : "var(--text-muted)",
          }}
        >
          Recent
        </button>
        <button
          onClick={() => onModeChange("format")}
          className="px-2.5 py-1 rounded-full transition-all duration-200 cursor-pointer"
          style={{
            background: viewMode === "format" ? "var(--surface-hover)" : "transparent",
            color: viewMode === "format" ? "var(--text-primary)" : "var(--text-muted)",
          }}
        >
          By format
        </button>
      </div>
    </div>
  );
}
