"use client";

import { useState, useEffect, useRef } from "react";
import { type UserId } from "../../../lib/users";
import { type CaptureMode } from "../../../lib/types";
import { type ThoughtRow, type UserTopic } from "./types";

interface UseThoughtActionsArgs {
  userId: UserId;
  captureMode?: CaptureMode;
  showingArchived: boolean;
  thoughts: ThoughtRow[];
  searchResults: ThoughtRow[] | null;
  expandedIds: Set<string>;
  setThoughts: React.Dispatch<React.SetStateAction<ThoughtRow[]>>;
  setSearchResults: React.Dispatch<React.SetStateAction<ThoughtRow[] | null>>;
}

export function useThoughtActions({
  userId,
  captureMode,
  showingArchived,
  thoughts,
  searchResults,
  expandedIds,
  setThoughts,
  setSearchResults,
}: UseThoughtActionsArgs) {
  const [transitioning, setTransitioning] = useState<Map<string, string>>(new Map());
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [armedTrashId, setArmedTrashId] = useState<string | null>(null);
  const [userTopics, setUserTopics] = useState<UserTopic[]>([]);
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState("");
  const tagEditorRef = useRef<HTMLDivElement>(null);

  // Fetch user topics
  useEffect(() => {
    fetch("/api/topics")
      .then((r) => r.json())
      .then((data) => setUserTopics(data.topics ?? []))
      .catch(() => setUserTopics([]));
  }, []);

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

  // Close tag editor when card collapses
  useEffect(() => {
    if (editingTagsId && !expandedIds.has(editingTagsId)) {
      setEditingTagsId(null);
      setNewTagInput("");
    }
  }, [expandedIds, editingTagsId]);

  /** Whether the current user owns a thought (can archive/restore it). */
  function isOwned(row: ThoughtRow): boolean {
    return row.user === userId;
  }

  async function toggleArchive(e: React.MouseEvent, row: ThoughtRow) {
    e.stopPropagation();
    if (!isOwned(row)) return; // safety
    const toArchive = !showingArchived;

    setFlashIds((prev) => new Set(prev).add(row.id));

    setTimeout(() => {
      setTransitioning((prev) => new Map(prev).set(row.id, "fading"));
    }, 600);

    try {
      const res = await fetch(`/api/capture/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: toArchive }),
      });
      if (!res.ok) throw new Error("PATCH failed");
    } catch {
      setFlashIds((prev) => { const next = new Set(prev); next.delete(row.id); return next; });
      setTransitioning((prev) => { const next = new Map(prev); next.delete(row.id); return next; });
      return;
    }

    setTimeout(() => {
      const remover = (prev: ThoughtRow[]) => prev.filter((c) => c.id !== row.id);
      setThoughts(remover);
      setSearchResults((prev) => prev ? remover(prev) : prev);
      setTransitioning((prev) => { const next = new Map(prev); next.delete(row.id); return next; });
      setFlashIds((prev) => { const next = new Set(prev); next.delete(row.id); return next; });
    }, 300);
  }

  function handleTrashClick(e: React.MouseEvent, row: ThoughtRow) {
    e.stopPropagation();
    if (!isOwned(row)) return;

    if (armedTrashId === row.id) {
      // Second click — actually trash it
      setArmedTrashId(null);
      doTrash(row);
    } else {
      // First click — arm it (show red confirmation state)
      setArmedTrashId(row.id);
    }
  }

  async function doTrash(row: ThoughtRow) {
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
      setFlashIds((prev) => { const next = new Set(prev); next.delete(row.id); return next; });
      setTransitioning((prev) => { const next = new Map(prev); next.delete(row.id); return next; });
      return;
    }

    setTimeout(() => {
      const remover = (prev: ThoughtRow[]) => prev.filter((c) => c.id !== row.id);
      setThoughts(remover);
      setSearchResults((prev) => prev ? remover(prev) : prev);
      setTransitioning((prev) => { const next = new Map(prev); next.delete(row.id); return next; });
      setFlashIds((prev) => { const next = new Set(prev); next.delete(row.id); return next; });
    }, 300);
  }

  function handleVisibilityClick(e: React.MouseEvent, row: ThoughtRow) {
    e.stopPropagation();
    const newVis = row.visibility === "private" ? "team" : "private";
    // Making shared requires shared mode; making private is always allowed
    if (newVis === "team" && captureMode !== "shared") return;
    doToggleVisibility(row);
  }

  async function doToggleVisibility(row: ThoughtRow) {
    const newVis = row.visibility === "private" ? "team" : "private";
    setThoughts((prev) => prev.map((c) => c.id === row.id ? { ...c, visibility: newVis } : c));
    try {
      const res = await fetch(`/api/capture/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: newVis, mode: captureMode }),
      });
      if (!res.ok) throw new Error("PATCH failed");
    } catch {
      setThoughts((prev) => prev.map((c) => c.id === row.id ? { ...c, visibility: row.visibility } : c));
    }
  }

  /** Optimistically update a thought's topics in both thoughts and searchResults. */
  function updateThoughtTopics(thoughtId: string, topics: string[]) {
    const updater = (prev: ThoughtRow[]) => prev.map((t) => (t.id === thoughtId ? { ...t, topics } : t));
    setThoughts(updater);
    setSearchResults((prev) => prev ? updater(prev) : prev);
  }

  async function toggleTopicOnThought(thoughtId: string, topicId: string, topicName: string) {
    // Read from whichever list is currently displayed
    const source = searchResults ?? thoughts;
    const thought = source.find((t) => t.id === thoughtId);
    if (!thought) return;

    const currentNames = thought.topics ?? [];
    const isOn = currentNames.includes(topicName);
    const newNames = isOn ? currentNames.filter((n) => n !== topicName) : [...currentNames, topicName];
    const newIds = userTopics.filter((ut) => newNames.includes(ut.name)).map((ut) => ut.id);

    updateThoughtTopics(thoughtId, newNames);

    try {
      const res = await fetch(`/api/capture/${thoughtId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicIds: newIds }),
      });
      if (!res.ok) throw new Error("PATCH failed");
    } catch {
      updateThoughtTopics(thoughtId, currentNames);
    }
  }

  async function createAndAssignTag(thoughtId: string, name: string) {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return;

    // If topic already exists, just toggle it on
    const existing = userTopics.find((t) => t.name.toLowerCase() === trimmed);
    if (existing) {
      const source = searchResults ?? thoughts;
      const thought = source.find((t) => t.id === thoughtId);
      if (thought && !(thought.topics ?? []).includes(existing.name)) {
        toggleTopicOnThought(thoughtId, existing.id, existing.name);
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
      const data = await res.json();
      if (!data.topic) return;

      const newTopic = data.topic as UserTopic;
      setUserTopics((prev) => [...prev, newTopic]);

      // Add to this thought
      const source = searchResults ?? thoughts;
      const thought = source.find((t) => t.id === thoughtId);
      if (!thought) return;
      const newNames = [...(thought.topics ?? []), newTopic.name];
      const newIds = [...userTopics, newTopic].filter((ut) => newNames.includes(ut.name)).map((ut) => ut.id);

      updateThoughtTopics(thoughtId, newNames);

      await fetch(`/api/capture/${thoughtId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicIds: newIds }),
      });

      setNewTagInput("");
    } catch {
      // silently fail
    }
  }

  return {
    transitioning,
    flashIds,
    armedTrashId,
    setArmedTrashId,
    userTopics,
    editingTagsId,
    setEditingTagsId,
    newTagInput,
    setNewTagInput,
    tagEditorRef,
    isOwned,
    toggleArchive,
    handleTrashClick,
    handleVisibilityClick,
    toggleTopicOnThought,
    createAndAssignTag,
  };
}
