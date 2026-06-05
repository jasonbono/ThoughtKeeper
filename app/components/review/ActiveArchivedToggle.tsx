"use client";

interface Props {
  showingArchived: boolean;
  onSwitch: (toArchived: boolean) => void;
}

export function ActiveArchivedToggle({ showingArchived, onSwitch }: Props) {
  return (
    <div className="flex items-center gap-1.5 animate-fade-up">
      <div
        className="flex items-center rounded-full p-0.5 text-xs font-semibold"
        style={{ background: "var(--surface)", border: "1px solid var(--border-bright)" }}
      >
        <button
          onClick={() => onSwitch(false)}
          className="px-3 py-1 rounded-full transition-all duration-200"
          style={{
            background: !showingArchived ? "var(--surface-hover)" : "transparent",
            color: !showingArchived ? "var(--text-primary)" : "var(--text-muted)",
          }}
        >
          Active
        </button>
        <button
          onClick={() => onSwitch(true)}
          className="px-3 py-1 rounded-full transition-all duration-200"
          style={{
            background: showingArchived ? "var(--surface-hover)" : "transparent",
            color: showingArchived ? "var(--text-primary)" : "var(--text-muted)",
          }}
        >
          Archived
        </button>
      </div>
    </div>
  );
}
