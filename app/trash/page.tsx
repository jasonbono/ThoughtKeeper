"use client";

import { useState, useEffect } from "react";
import { getFormatMeta } from "../../lib/users";
import { Trash2 } from "lucide-react";

interface TrashedThought {
  id: string;
  title: string;
  raw_text: string;
  format: string;
  created_at: string;
  user: string;
}

export default function TrashPage() {
  const [thoughts, setThoughts] = useState<TrashedThought[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());
  const formatMeta = getFormatMeta();

  useEffect(() => {
    fetch("/api/trash")
      .then((r) => r.json())
      .then((data) => setThoughts(data.thoughts ?? []))
      .catch(() => setThoughts([]))
      .finally(() => setLoading(false));
  }, []);

  async function restore(id: string) {
    setRestoringIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/capture/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: false }),
      });
      if (!res.ok) throw new Error();
      setThoughts((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // Restore failed — refetch to ensure UI matches server state
      fetch("/api/trash")
        .then((r) => r.json())
        .then((data) => setThoughts(data.thoughts ?? []));
    } finally {
      setRestoringIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center px-6"
      style={{
        background: "var(--bg)",
        paddingTop: "calc(2rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div className="w-full max-w-[560px] flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trash2 size={20} color="var(--text-muted)" />
            <span
              className="font-black tracking-[-0.04em]"
              style={{ fontSize: "clamp(1.8rem, 5vw, 2.5rem)", color: "var(--text-primary)" }}
            >
              Trash
            </span>
          </div>
          <a
            href="/"
            className="text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
            style={{ background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border-bright)", textDecoration: "none" }}
          >
            Back
          </a>
        </div>

        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Items moved to trash. Restore anything you trashed by mistake.
        </p>

        {loading ? (
          <p className="text-sm animate-pulse" style={{ color: "var(--text-secondary)" }}>
            Loading...
          </p>
        ) : thoughts.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Trash is empty.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {thoughts.map((row) => {
              const meta = formatMeta[row.format];
              const restoring = restoringIds.has(row.id);
              return (
                <div
                  key={row.id}
                  className="rounded-xl overflow-hidden"
                  style={{ border: "1px solid var(--border-bright)" }}
                >
                  <div className="px-4 py-3.5 flex items-start justify-between gap-3">
                    <div className="flex-1 flex flex-col gap-1">
                      <span
                        className="text-sm leading-snug font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {row.title}
                      </span>
                      {meta && (
                        <span
                          className="text-[10px] font-semibold"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {meta.labelPlural}
                        </span>
                      )}
                      <p
                        className="text-xs leading-relaxed whitespace-pre-wrap line-clamp-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {row.raw_text}
                      </p>
                    </div>
                    <button
                      onClick={() => restore(row.id)}
                      disabled={restoring}
                      className="text-xs px-3 py-1.5 rounded-md cursor-pointer transition-all shrink-0 disabled:opacity-40"
                      style={{ background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border-bright)" }}
                    >
                      {restoring ? "Restoring..." : "Restore"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
