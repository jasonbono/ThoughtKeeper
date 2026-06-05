"use client";

import { useRef, useState, useEffect } from "react";
import { type UserId, type FormatConfig, USERS } from "../../../lib/users";
import { formatDueDate, formatDateTime, parseDueAt } from "../../../lib/format";
import { useAppStore } from "../../../lib/store";
import { truncateText } from "../text-utils";
import ClickableImage from "../ClickableImage";
import { type CaptureMode } from "../../../lib/types";
import { Image, Trash2, Lock, Users, Plus, Check, ChevronUp, ChevronDown } from "lucide-react";
import { type ThoughtRow, type UserTopic } from "./types";

interface Props {
  row: ThoughtRow;
  expanded: boolean;
  fading: boolean;
  flashing: boolean;
  owned: boolean;
  showFormatSticker: boolean;
  showNameTags: boolean;
  showingArchived: boolean;
  highlightThoughtId?: string | null;
  captureMode?: CaptureMode;
  formatMetaMap: Record<string, FormatConfig>;
  transitioning: Map<string, string>;
  armedTrashId: string | null;
  editingTagsId: string | null;
  newTagInput: string;
  userTopics: UserTopic[];
  onUpdate?: (id: string, updated: ThoughtRow) => void;
  onToggleExpand: (id: string) => void;
  onToggleArchive: (e: React.MouseEvent, row: ThoughtRow) => void;
  onHandleTrashClick: (e: React.MouseEvent, row: ThoughtRow) => void;
  onSetArmedTrashId: (id: string | null) => void;
  onHandleVisibilityClick: (e: React.MouseEvent, row: ThoughtRow) => void;
  onSetEditingTagsId: (id: string | null) => void;
  onSetNewTagInput: (value: string) => void;
  onToggleTopicOnThought: (thoughtId: string, topicId: string, topicName: string) => void;
  onCreateAndAssignTag: (thoughtId: string, name: string) => void;
  tagEditorRef: React.RefObject<HTMLDivElement | null>;
}

export function ThoughtCard({
  row,
  expanded,
  fading,
  flashing,
  owned,
  showFormatSticker,
  showNameTags,
  showingArchived,
  highlightThoughtId,
  captureMode,
  formatMetaMap,
  transitioning,
  armedTrashId,
  editingTagsId,
  newTagInput,
  userTopics,
  onUpdate,
  onToggleExpand,
  onToggleArchive,
  onHandleTrashClick,
  onSetArmedTrashId,
  onHandleVisibilityClick,
  onSetEditingTagsId,
  onSetNewTagInput,
  onToggleTopicOnThought,
  onCreateAndAssignTag,
  tagEditorRef,
}: Props) {
  const tz = useAppStore(s => s.timezone);
  const [showSlimthought, setShowSlimthought] = useState(false);
  const preview = truncateText(row.raw_text);
  const hasMore = row.char_count > preview.length || !!row.has_image;

  // Inline editing
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const ta = textareaRef.current;
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    }
  }, [isEditing, editBody]);

  function startEditing(e: React.MouseEvent) {
    e.stopPropagation();
    setIsDeferring(false);
    setEditTitle(row.title);
    setEditBody(row.raw_text);
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
  }

  async function saveEdits() {
    const trimmedBody = editBody.trim();
    const trimmedTitle = editTitle.trim();
    if (!trimmedBody || !trimmedTitle) return;

    const bodyChanged = trimmedBody !== row.raw_text;
    const titleChanged = trimmedTitle !== row.title;

    if (!bodyChanged && !titleChanged) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    try {
      if (bodyChanged) {
        const res = await fetch(`/api/capture/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw_text: trimmedBody }),
        });
        if (!res.ok) throw new Error("Save failed");
      } else if (titleChanged) {
        const res = await fetch(`/api/capture/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmedTitle }),
        });
        if (!res.ok) throw new Error("Save failed");
      }

      // Refetch to get updated fields (title from classification, slimthought, etc.)
      const res = await fetch(`/api/capture/${row.id}`);
      if (res.ok) {
        const { thought } = await res.json();
        onUpdate?.(row.id, thought);
      }
      setIsEditing(false);
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveEdits();
    }
    if (e.key === "Escape") {
      cancelEditing();
    }
  }

  // ── Defer ──
  const [isDeferring, setIsDeferring] = useState(false);
  const [deferDays, setDeferDays] = useState(1);
  const [deferHours, setDeferHours] = useState(0);
  const [deferField, setDeferField] = useState<"days" | "hours">("days");
  const [deferMode, setDeferMode] = useState<"relative" | "absolute">("relative");
  const [absoluteDate, setAbsoluteDate] = useState("");
  const [deferSaving, setDeferSaving] = useState(false);
  const deferRef = useRef<HTMLDivElement>(null);

  function toDatetimeLocalValue(iso: string): string {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const g = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
    const h = g("hour") === "24" ? "00" : g("hour");
    return `${g("year")}-${g("month")}-${g("day")}T${h}:${g("minute")}`;
  }

  function startDeferring(e: React.MouseEvent) {
    e.stopPropagation();
    setIsEditing(false);
    setDeferDays(1);
    setDeferHours(0);
    setDeferField("days");
    setDeferMode("relative");
    setAbsoluteDate(row.due_at ? toDatetimeLocalValue(row.due_at) : "");
    setIsDeferring(true);
    setTimeout(() => deferRef.current?.focus(), 50);
  }

  function cancelDeferring() {
    setIsDeferring(false);
  }

  async function applyDefer() {
    if (deferMode === "relative" && deferDays === 0 && deferHours === 0) return;
    setDeferSaving(true);
    try {
      let newDueAt: string | null;
      if (deferMode === "absolute") {
        newDueAt = parseDueAt(absoluteDate.replace("T", " "), tz);
      } else {
        const target = new Date(Date.now() + deferDays * 86400000 + deferHours * 3600000);
        const dateStr = target.toLocaleDateString("en-CA", { timeZone: tz });
        const timeStr = target.toLocaleTimeString("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" });
        newDueAt = parseDueAt(`${dateStr} ${timeStr}`, tz);
      }

      const res = await fetch(`/api/capture/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ due_at: newDueAt }),
      });
      if (!res.ok) throw new Error("Save failed");

      const refetch = await fetch(`/api/capture/${row.id}`);
      if (refetch.ok) {
        const { thought } = await refetch.json();
        onUpdate?.(row.id, thought);
      }
      setIsDeferring(false);
    } catch (err) {
      console.error("Defer failed:", err);
    } finally {
      setDeferSaving(false);
    }
  }

  function handleDeferKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (deferField === "days") setDeferDays(d => d + 1);
      else setDeferHours(h => Math.min(23, h + 1));
      setDeferMode("relative");
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (deferField === "days") setDeferDays(d => Math.max(0, d - 1));
      else setDeferHours(h => Math.max(0, h - 1));
      setDeferMode("relative");
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setDeferField("hours");
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setDeferField("days");
    }
    if (e.key === "Enter") {
      e.preventDefault();
      applyDefer();
    }
    if (e.key === "Escape") {
      cancelDeferring();
    }
  }

  return (
    <div
      key={row.id}
      id={`thought-${row.id}`}
      className={`rounded-xl ${expanded && !fading ? "overflow-x-hidden overflow-y-auto" : "overflow-hidden"}`}
      style={{
        border: row.id === highlightThoughtId
          ? "1px solid var(--accent)"
          : "1px solid var(--border-bright)",
        opacity: fading ? 0 : 1,
        maxHeight: fading ? "0px" : "600px",
        transition: fading
          ? "opacity 300ms ease, max-height 300ms ease"
          : "opacity 150ms ease",
      }}
    >
      <div
        onClick={() => {
          if (isEditing || isDeferring) return;
          const sel = window.getSelection();
          if (sel && sel.toString().length > 0) return;
          onToggleExpand(row.id);
        }}
        className="thought-row w-full text-left px-4 py-3.5 flex flex-col gap-2 cursor-pointer"
      >
        {/* Title row -- always visible */}
        <div className="flex items-start gap-2">
          {(() => {
            const isPrivate = row.visibility === "private";
            const canToggle = isPrivate ? captureMode === "shared" : true;
            return (
              <button
                onClick={(e) => canToggle ? onHandleVisibilityClick(e, row) : e.stopPropagation()}
                className="shrink-0 mt-0.5 cursor-pointer transition-all duration-200"
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: isPrivate ? "#d97706" : "#3b82f6",
                }}
                title={isPrivate
                  ? (canToggle ? "Click to share with team" : "Private")
                  : "Click to make private"}
              >
                {isPrivate
                  ? <Lock size={12} strokeWidth={2} className="opacity-50 hover:opacity-80 transition-opacity" />
                  : <Users size={12} strokeWidth={2} className="opacity-50 hover:opacity-80 transition-opacity" />}
              </button>
            );
          })()}
          {!!row.has_image && (
            <Image size={14} color="var(--text-muted)" className="shrink-0 mt-0.5" />
          )}
          {isEditing ? (
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              className="text-sm leading-snug font-medium flex-1 min-w-0 outline-none rounded-md px-2 py-1"
              style={{
                color: "var(--text-primary)",
                background: "var(--surface-hover)",
                border: "1px solid var(--border-bright)",
              }}
            />
          ) : (
            <span
              className="text-sm leading-snug font-medium flex-1 min-w-0 line-clamp-2"
              style={{ color: "var(--text-primary)" }}
            >
              {row.title}
            </span>
          )}
          {showFormatSticker && (() => {
            const bMeta = formatMetaMap[row.format];
            if (!bMeta) return null;
            return (
              <span
                className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold shrink-0"
                style={{ ...bMeta.pillStyle, ...(!expanded ? { opacity: 0.45 } : {}) }}
              >
                <span className="w-1 h-1 rounded-full" style={bMeta.dotStyle} />
                {bMeta.label}
              </span>
            );
          })()}
          {showNameTags && row.user && (
            <span
              className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide shrink-0"
              style={{
                background: "var(--surface-hover)",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
              }}
            >
              {USERS[row.user as UserId]?.displayName ?? row.user}
            </span>
          )}
        </div>

        {expanded ? (
          <>
            {isDeferring ? (
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Due:</span>
                <input
                  type="datetime-local"
                  value={absoluteDate}
                  onChange={(e) => { setAbsoluteDate(e.target.value); setDeferMode("absolute"); }}
                  className="text-[11px] tabular-nums rounded-md px-1.5 py-0.5 outline-none"
                  style={{
                    background: "var(--surface-hover)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-bright)",
                    colorScheme: "dark",
                  }}
                />
              </div>
            ) : row.due_at ? (
              <span
                className="text-[11px] font-medium tabular-nums"
                style={{ color: "var(--text-secondary)" }}
              >
                {formatDueDate(row.due_at, tz)}
              </span>
            ) : null}
            {!!row.has_image && (
              <ClickableImage
                src={`/api/capture/${row.id}/image`}
                alt="Thought image"
                className="rounded-lg max-w-full max-h-48 object-contain"
                style={{ border: "1px solid var(--border)" }}
              />
            )}
            {isEditing ? (
              <textarea
                ref={textareaRef}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                onKeyDown={handleEditKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="text-sm leading-relaxed w-full outline-none resize-none rounded-md p-2"
                style={{
                  color: "var(--text-secondary)",
                  background: "var(--surface-hover)",
                  border: "1px solid var(--border-bright)",
                  minHeight: "60px",
                }}
              />
            ) : showSlimthought ? (
              <div className="flex flex-col gap-1.5">
                <span
                  className="text-[9px] font-bold tracking-[0.15em] uppercase"
                  style={{ color: "var(--text-muted)" }}
                >
                  Slimthought
                </span>
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
                  {row.slimthought ?? "Not generated yet"}
                </p>
              </div>
            ) : (
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
                {row.raw_text}
              </p>
            )}

            {/* Date + time + actions -- expanded only */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                {formatDateTime(row.created_at, tz)}
                {row.char_count > 0 && <> &middot; {row.char_count.toLocaleString()} chars</>}
              </span>
              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                {owned && !isEditing && (
                  flashing ? (
                    <span
                      className="text-xs px-2 py-0.5 rounded-md"
                      style={{ background: "var(--surface-hover)", color: "var(--text-secondary)" }}
                    >
                      {transitioning.get(row.id) === "trashing" ? "Trashed." : showingArchived ? "Restored." : "Archived."}
                    </span>
                  ) : (
                    <button
                      onClick={(e) => onToggleArchive(e, row)}
                      className="archive-btn text-xs px-2 py-0.5 rounded-md transition-opacity opacity-25 hover:opacity-70 cursor-pointer"
                      style={{ background: "var(--surface-hover)", color: "var(--text-secondary)" }}
                    >
                      {showingArchived ? "Restore" : "Archive"}
                    </button>
                  )
                )}
                {owned && !isEditing && !showingArchived && !flashing && (() => {
                  const armed = armedTrashId === row.id;
                  return (
                    <button
                      onClick={(e) => onHandleTrashClick(e, row)}
                      onBlur={() => { if (armed) onSetArmedTrashId(null); }}
                      className="p-1 rounded-md cursor-pointer transition-all"
                      style={{
                        opacity: armed ? 1 : undefined,
                        color: armed ? "#ef4444" : "var(--text-muted)",
                      }}
                      title={armed ? "Click again to trash" : "Move to trash"}
                    >
                      <Trash2
                        size={13}
                        strokeWidth={armed ? 2.5 : 2}
                        className={armed ? "" : "opacity-15 hover:opacity-60 transition-opacity"}
                      />
                    </button>
                  );
                })()}
              </div>
            </div>

            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {isEditing ? (
                <>
                  <button
                    onClick={saveEdits}
                    disabled={saving}
                    className="text-xs px-3 py-1 rounded-md cursor-pointer transition-all w-fit"
                    style={{
                      background: "var(--accent-dim)",
                      color: "var(--accent)",
                      border: "1px solid var(--accent-dim)",
                      opacity: saving ? 0.5 : 1,
                    }}
                  >
                    {saving ? "Saving\u2026" : "Save"}
                  </button>
                  <button
                    onClick={cancelEditing}
                    disabled={saving}
                    className="text-xs px-3 py-1 rounded-md cursor-pointer transition-all w-fit"
                    style={{
                      background: "var(--surface-hover)",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {owned && (
                    <button
                      onClick={startEditing}
                      className="text-xs px-3 py-1 rounded-md cursor-pointer transition-all w-fit"
                      style={{
                        background: "var(--accent-dim)",
                        color: "var(--accent)",
                        border: "1px solid var(--accent-dim)",
                      }}
                    >
                      Edit
                    </button>
                  )}
                  {owned && row.format === "todo" && (
                    <button
                      onClick={startDeferring}
                      className="text-xs px-3 py-1 rounded-md cursor-pointer transition-all w-fit"
                      style={{
                        background: isDeferring ? "var(--surface-hover)" : "var(--surface)",
                        color: "var(--text-muted)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      Defer
                    </button>
                  )}
                  {row.slimthought && row.char_count > 150 && (
                    <button
                      onClick={() => setShowSlimthought(!showSlimthought)}
                      className="text-xs px-3 py-1 rounded-md cursor-pointer transition-all w-fit"
                      style={{
                        background: showSlimthought ? "var(--surface-hover)" : "var(--surface)",
                        color: "var(--text-muted)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {showSlimthought ? "Full text" : "Flip"}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Defer picker */}
            {isDeferring && (
              <div
                ref={deferRef}
                tabIndex={0}
                onKeyDown={handleDeferKeyDown}
                className="flex items-center gap-3 outline-none"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Days */}
                <div className="flex items-center gap-1">
                  <div
                    className="flex flex-col items-center rounded-md px-2 py-0.5"
                    style={{
                      background: deferField === "days" ? "var(--accent-dim)" : "var(--surface-hover)",
                      border: deferField === "days" ? "1px solid var(--accent-dim)" : "1px solid var(--border)",
                      cursor: "pointer",
                    }}
                    onClick={() => setDeferField("days")}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeferField("days"); setDeferDays(d => d + 1); setDeferMode("relative"); }}
                      className="cursor-pointer opacity-40 hover:opacity-80 transition-opacity"
                      style={{ background: "none", border: "none", padding: 0, color: "var(--text-muted)" }}
                    >
                      <ChevronUp size={12} />
                    </button>
                    <span
                      className="text-sm tabular-nums font-semibold leading-none"
                      style={{ color: deferField === "days" ? "var(--accent)" : "var(--text-primary)", minWidth: "16px", textAlign: "center" }}
                    >
                      {deferDays}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeferField("days"); setDeferDays(d => Math.max(0, d - 1)); setDeferMode("relative"); }}
                      className="cursor-pointer opacity-40 hover:opacity-80 transition-opacity"
                      style={{ background: "none", border: "none", padding: 0, color: "var(--text-muted)" }}
                    >
                      <ChevronDown size={12} />
                    </button>
                  </div>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>days</span>
                </div>

                {/* Hours */}
                <div className="flex items-center gap-1">
                  <div
                    className="flex flex-col items-center rounded-md px-2 py-0.5"
                    style={{
                      background: deferField === "hours" ? "var(--accent-dim)" : "var(--surface-hover)",
                      border: deferField === "hours" ? "1px solid var(--accent-dim)" : "1px solid var(--border)",
                      cursor: "pointer",
                    }}
                    onClick={() => setDeferField("hours")}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeferField("hours"); setDeferHours(h => Math.min(23, h + 1)); setDeferMode("relative"); }}
                      className="cursor-pointer opacity-40 hover:opacity-80 transition-opacity"
                      style={{ background: "none", border: "none", padding: 0, color: "var(--text-muted)" }}
                    >
                      <ChevronUp size={12} />
                    </button>
                    <span
                      className="text-sm tabular-nums font-semibold leading-none"
                      style={{ color: deferField === "hours" ? "var(--accent)" : "var(--text-primary)", minWidth: "16px", textAlign: "center" }}
                    >
                      {deferHours}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeferField("hours"); setDeferHours(h => Math.max(0, h - 1)); setDeferMode("relative"); }}
                      className="cursor-pointer opacity-40 hover:opacity-80 transition-opacity"
                      style={{ background: "none", border: "none", padding: 0, color: "var(--text-muted)" }}
                    >
                      <ChevronDown size={12} />
                    </button>
                  </div>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>hrs</span>
                </div>

                {/* Apply / Cancel */}
                <button
                  onClick={applyDefer}
                  disabled={deferSaving || (deferMode === "relative" && deferDays === 0 && deferHours === 0)}
                  className="text-xs px-3 py-1 rounded-md cursor-pointer transition-all w-fit"
                  style={{
                    background: "var(--accent-dim)",
                    color: "var(--accent)",
                    border: "1px solid var(--accent-dim)",
                    opacity: deferSaving || (deferMode === "relative" && deferDays === 0 && deferHours === 0) ? 0.4 : 1,
                  }}
                >
                  {deferSaving ? "Saving\u2026" : "Apply"}
                </button>
                <button
                  onClick={cancelDeferring}
                  disabled={deferSaving}
                  className="text-xs px-3 py-1 rounded-md cursor-pointer transition-all w-fit"
                  style={{
                    background: "var(--surface-hover)",
                    color: "var(--text-muted)",
                    border: "1px solid var(--border)",
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Topics -- inline tag editor */}
            {editingTagsId === row.id && owned ? (
              <div
                ref={tagEditorRef}
                className="flex flex-col gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex gap-1.5 flex-wrap items-center">
                  {userTopics.map((topic) => {
                    const assigned = (row.topics ?? []).includes(topic.name);
                    return (
                      <button
                        key={topic.id}
                        onClick={() => onToggleTopicOnThought(row.id, topic.id, topic.name)}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium cursor-pointer transition-all"
                        style={assigned
                          ? { background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--accent-dim)" }
                          : { background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)" }
                        }
                      >
                        {assigned ? <Check size={9} strokeWidth={3} /> : null}
                        {topic.name}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={(e) => onSetNewTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onCreateAndAssignTag(row.id, newTagInput);
                      }
                      if (e.key === "Escape") {
                        onSetEditingTagsId(null);
                        onSetNewTagInput("");
                      }
                    }}
                    placeholder="new tag…"
                    autoFocus
                    className="text-[11px] px-2 py-1 rounded-md outline-none"
                    style={{
                      background: "var(--surface-hover)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                      width: "100px",
                    }}
                  />
                  <button
                    onClick={() => { onSetEditingTagsId(null); onSetNewTagInput(""); }}
                    className="text-[10px] font-medium rounded-full px-2 py-0.5 cursor-pointer transition-opacity hover:opacity-80"
                    style={{ background: "var(--surface-hover)", color: "var(--text-muted)" }}
                  >
                    done
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-1.5 flex-wrap items-center justify-end">
                {(row.topics ?? []).map((tn) => (
                  <span
                    key={tn}
                    className="text-[10px] font-medium rounded-full px-1.5 py-0.5"
                    style={{ background: "var(--surface-hover)", color: "var(--accent)" }}
                  >
                    #{tn}
                  </span>
                ))}
                {owned && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onSetEditingTagsId(row.id); }}
                    className="add-tag-btn inline-flex items-center justify-center rounded-full cursor-pointer transition-opacity"
                    style={{
                      width: "20px",
                      height: "20px",
                      background: "var(--accent-dim)",
                      color: "var(--accent)",
                      border: "1px solid var(--accent-dim)",
                    }}
                    title="Edit tags"
                  >
                    <Plus size={12} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <p
              className="text-sm leading-relaxed whitespace-pre-wrap"
              style={{ color: "var(--text-secondary)" }}
            >
              {preview}
            </p>
            {(hasMore || (row.topics ?? []).length > 0) && (
              <div className="flex items-center gap-2">
                {hasMore && (
                  <span
                    className="text-[11px] font-medium tracking-wide shrink-0"
                    style={{ color: "var(--text-muted)" }}
                  >
                    expand ↓
                  </span>
                )}
                {(row.topics ?? []).length > 0 && (
                  <div className="flex gap-1.5 flex-wrap items-center justify-end flex-1 min-w-0">
                    {(row.topics ?? []).map((tn) => (
                      <span
                        key={tn}
                        className="text-[10px] font-medium rounded-full px-1.5 py-0.5"
                        style={{ background: "var(--surface-hover)", color: "var(--accent)", opacity: 0.45 }}
                      >
                        #{tn}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
