"use client";

interface Props {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function SearchBar({ searchQuery, onSearchChange }: Props) {
  return (
    <div className="animate-fade-up-delay-1">
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search thoughts…"
        className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all duration-200"
        style={{
          background: "var(--bg-subtle)",
          border: "1px solid var(--border-bright)",
          color: "var(--text-primary)",
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}
