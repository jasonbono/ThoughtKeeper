"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useAppStore } from "../../lib/store";
import { getFormatMeta } from "../../lib/users";
import { type ThoughtRow, type UserTopic } from "./review/types";
import { ThoughtCardPreview } from "./ThoughtCardPreview";
import { ThoughtCard } from "./review/ThoughtCard";

interface ExpandableThoughtProps {
  /** Minimal data for the preview (must include `id`). */
  data: Record<string, unknown>;
  /** Format metadata for preview rendering. */
  formatMeta: Record<string, import("../../lib/users").FormatConfig>;
  /** Preview variant. */
  variant?: "saved" | "listed";
  /** Called after archive/trash so the parent can react. */
  onMutate?: (id: string, action: "archived" | "trashed") => void;
  className?: string;
}

export function ExpandableThought({
  data,
  formatMeta,
  variant = "saved",
  onMutate,
  className,
}: ExpandableThoughtProps) {
  const [expanded, setExpanded] = useState(false);
  const [fullData, setFullData] = useState<ThoughtRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Standalone action state
  const [armedTrashId, setArmedTrashId] = useState<string | null>(null);
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState("");
  const [userTopics, setUserTopics] = useState<UserTopic[]>([]);
  const [transitioning, setTransitioning] = useState<Map<string, string>>(new Map());
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const tagEditorRef = useRef<HTMLDivElement>(null);

  const captureMode = useAppStore((s) => s.captureMode);
  const userId = useAppStore((s) => s.userId);
  const formatMetaMap = useMemo(() => getFormatMeta(), []);

  const thoughtId = (data.id ?? (data.thought as Record<string, unknown> | undefined)?.id) as string | undefined;

  // Fetch topics when expanded
  useEffect(() => {
    if (!expanded) return;
    fetch("/api/topics")
      .then((r) => r.json())
      .then((d) => setUserTopics(d.topics ?? []))
      .catch(() => setUserTopics([]));
  }, [expanded]);

  // Close tag editor on click outside
  useEffect(() => {
    if (!editingTagsId) return;
    function handleClick(e: MouseEvent) {
      if (tagEditorRef.current && !tagEditorRef.current.contains(e.target as Node)) {
        setEditingTagsId(null);
        setNewTagInput("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [editingTagsId]);

  const handleExpand = useCallback(async () => {
    if (!thoughtId) return;
    if (expanded) {
      // Collapse
      setExpanded(false);
      setEditingTagsId(null);
      setNewTagInput("");
      setArmedTrashId(null);
      return;
    }

    setExpanded(true);
    setLoading(true);
    setError(false);

    try {
      const res = await fetch(`/api/capture/${thoughtId}`);
      if (!res.ok) throw new Error("fetch failed");
      const { thought } = await res.json();
      setFullData(thought as ThoughtRow);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [thoughtId, expanded]);

  // ── Action handlers (standalone) ──

  const handleToggleArchive = useCallback(async (e: React.MouseEvent, row: ThoughtRow) => {
    e.stopPropagation();
    setFlashIds((prev) => new Set(prev).add(row.id));
    setTimeout(() => {
      setTransitioning((prev) => new Map(prev).set(row.id, "fading"));
    }, 600);

    try {
      const res = await fetch(`/api/capture/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) throw new Error("PATCH failed");
    } catch {
      setFlashIds((prev) => { const n = new Set(prev); n.delete(row.id); return n; });
      setTransitioning((prev) => { const n = new Map(prev); n.delete(row.id); return n; });
      return;
    }

    setTimeout(() => {
      setExpanded(false);
      setTransitioning(new Map());
      setFlashIds(new Set());
      onMutate?.(row.id, "archived");
    }, 300);
  }, [onMutate]);

  const handleTrashClick = useCallback((e: React.MouseEvent, row: ThoughtRow) => {
    e.stopPropagation();
    if (armedTrashId === row.id) {
      setArmedTrashId(null);
      doTrash(row);
    } else {
      setArmedTrashId(row.id);
    }
  }, [armedTrashId]);

  const doTrash = useCallback(async (row: ThoughtRow) => {
    setFlashIds((prev) => new Set(prev).add(row.id));
    setTransitioning((prev) => new Map(prev).set(row.id, "trashing"));
    setTimeout(() => {
      setTransitioning((prev) => new Map(prev).set(row.id, "fading"));
    }, 600);

    try {
      const res = await fetch(`/api/capture/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: true }),
      });
      if (!res.ok) throw new Error("PATCH failed");
    } catch {
      setFlashIds((prev) => { const n = new Set(prev); n.delete(row.id); return n; });
      setTransitioning((prev) => { const n = new Map(prev); n.delete(row.id); return n; });
      return;
    }

    setTimeout(() => {
      setExpanded(false);
      setTransitioning(new Map());
      setFlashIds(new Set());
      onMutate?.(row.id, "trashed");
    }, 300);
  }, [onMutate]);

  const handleVisibilityClick = useCallback(async (e: React.MouseEvent, row: ThoughtRow) => {
    e.stopPropagation();
    const newVis = row.visibility === "private" ? "team" : "private";
    if (newVis === "team" && captureMode !== "shared") return;

    // Optimistic update
    setFullData((prev) => prev ? { ...prev, visibility: newVis } : prev);
    try {
      const res = await fetch(`/api/capture/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: newVis, mode: captureMode }),
      });
      if (!res.ok) throw new Error("PATCH failed");
    } catch {
      setFullData((prev) => prev ? { ...prev, visibility: row.visibility } : prev);
    }
  }, [captureMode]);

  const handleToggleTopicOnThought = useCallback(async (thoughtId: string, topicId: string, topicName: string) => {
    if (!fullData) return;
    const currentNames = fullData.topics ?? [];
    const isOn = currentNames.includes(topicName);
    const newNames = isOn ? currentNames.filter((n) => n !== topicName) : [...currentNames, topicName];
    const newIds = userTopics.filter((ut) => newNames.includes(ut.name)).map((ut) => ut.id);

    setFullData((prev) => prev ? { ...prev, topics: newNames } : prev);
    try {
      const res = await fetch(`/api/capture/${thoughtId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicIds: newIds }),
      });
      if (!res.ok) throw new Error("PATCH failed");
    } catch {
      setFullData((prev) => prev ? { ...prev, topics: currentNames } : prev);
    }
  }, [fullData, userTopics]);

  const handleCreateAndAssignTag = useCallback(async (thoughtId: string, name: string) => {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed || !fullData) return;

    const existing = userTopics.find((t) => t.name.toLowerCase() === trimmed);
    if (existing) {
      if (!(fullData.topics ?? []).includes(existing.name)) {
        handleToggleTopicOnThought(thoughtId, existing.id, existing.name);
      }
      setNewTagInput("");
      return;
    }

    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const d = await res.json();
      if (!d.topic) return;

      const newTopic = d.topic as UserTopic;
      setUserTopics((prev) => [...prev, newTopic]);

      const newNames = [...(fullData.topics ?? []), newTopic.name];
      const newIds = [...userTopics, newTopic].filter((ut) => newNames.includes(ut.name)).map((ut) => ut.id);

      setFullData((prev) => prev ? { ...prev, topics: newNames } : prev);
      await fetch(`/api/capture/${thoughtId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicIds: newIds }),
      });
      setNewTagInput("");
    } catch {
      // silently fail
    }
  }, [fullData, userTopics, handleToggleTopicOnThought]);

  const handleThoughtUpdate = useCallback((_id: string, updated: ThoughtRow) => {
    setFullData((prev) => prev ? { ...prev, ...updated } : prev);
  }, []);

  // ── Render ──

  if (!expanded) {
    return (
      <div onClick={handleExpand} style={{ cursor: "pointer" }}>
        <ThoughtCardPreview
          data={data}
          formatMeta={formatMeta}
          variant={variant}
          className={className}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="rounded-xl overflow-hidden"
        style={{
          border: "1px solid var(--border-bright)",
          padding: "1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "80px",
        }}
      >
        <span className="dot-pulse" style={{ color: "var(--text-muted)" }} />
      </div>
    );
  }

  if (error || !fullData) {
    return (
      <div
        onClick={handleExpand}
        className="rounded-xl overflow-hidden"
        style={{
          border: "1px solid var(--border-bright)",
          padding: "1rem",
          cursor: "pointer",
          textAlign: "center",
          fontSize: "0.85rem",
          color: "var(--text-muted)",
        }}
      >
        Couldn&apos;t load thought. Tap to retry.
      </div>
    );
  }

  return (
    <ThoughtCard
      row={fullData}
      expanded={true}
      fading={transitioning.has(fullData.id) && transitioning.get(fullData.id) === "fading"}
      flashing={flashIds.has(fullData.id)}
      owned={fullData.user === userId}
      showFormatSticker={true}
      showNameTags={false}
      showingArchived={false}
      captureMode={captureMode}
      formatMetaMap={formatMetaMap}
      transitioning={transitioning}
      armedTrashId={armedTrashId}
      editingTagsId={editingTagsId}
      newTagInput={newTagInput}
      userTopics={userTopics}
      onUpdate={handleThoughtUpdate}
      onToggleExpand={handleExpand}
      onToggleArchive={handleToggleArchive}
      onHandleTrashClick={handleTrashClick}
      onSetArmedTrashId={setArmedTrashId}
      onHandleVisibilityClick={handleVisibilityClick}
      onSetEditingTagsId={setEditingTagsId}
      onSetNewTagInput={setNewTagInput}
      onToggleTopicOnThought={handleToggleTopicOnThought}
      onCreateAndAssignTag={handleCreateAndAssignTag}
      tagEditorRef={tagEditorRef}
    />
  );
}
