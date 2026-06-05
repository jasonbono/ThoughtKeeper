"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { getFormatMeta } from "../../lib/users";
import { useChat } from "../hooks/useChat";
import type { ApiMessage, Visibility } from "../../lib/types";
import { useAppStore } from "../../lib/store";
import { ChatMessageBubble } from "./ChatMessages";
import { Plus, Pencil, Trash2, X, ArrowUp, List, Lock, Users, Play } from "lucide-react";

interface Template {
  id: string;
  user_id: string;
  title: string;
  content: string;
  archived: number;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
}

// ── Relative time helper ──

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TemplatesView() {
  const userId = useAppStore(s => s.userId)!;
  const theme = useAppStore(s => s.theme);
  const captureMode = useAppStore(s => s.captureMode);
  // ── Template state ──
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null); // "new" for create mode
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [armedTrashId, setArmedTrashId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const dragging = useRef(false);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);


  const formatMeta = getFormatMeta();

  const selectedTemplate = templates.find((t) => t.id === selectedId) ?? null;

  // Keep a ref so the context builder always sees the latest template
  const selectedTemplateRef = useRef(selectedTemplate);
  selectedTemplateRef.current = selectedTemplate;

  // ── Shared chat hook ──
  const getContextPrefix = useCallback((): ApiMessage[] | undefined => {
    const tpl = selectedTemplateRef.current;
    if (!tpl) return undefined;
    return [
      { role: "user", content: `[Context: The user has selected a template to fill out. Template title: "${tpl.title}". Template content:\n${tpl.content}\n\nWhen the user asks you to fill this out, use query_thoughts to retrieve relevant data, then fill in the template placeholders with real content from their thoughts. Preserve the logical structure (headers, sections, groupings) but always render using proper markdown syntax: \`## Header\` for sections, \`- item\` for list items, **bold** for emphasis. Never use plain indentation for lists — it won't render. Every enumerated item must be a markdown bullet.]` },
      { role: "assistant", content: "Got it — I have the template loaded and ready to fill out. What would you like me to focus on?" },
    ];
  }, []);

  const { messages, isStreaming, sendMessage, clearMessages } = useChat({
    source: "templates",
    captureMode,
    getContextPrefix,
  });

  // Split templates: own first, then shared from others
  const ownTemplates = templates.filter((t) => t.user_id === userId);
  const sharedTemplates = templates.filter((t) => t.user_id !== userId);

  // ── Fetch templates ──

  const fetchTemplates = useCallback(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data) => {
        if (data.templates) setTemplates(data.templates);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates, userId]);

  // Clear chat when user switches
  const prevUserRef = useRef(userId);
  useEffect(() => {
    if (prevUserRef.current !== userId) {
      clearMessages();
      setInput("");
      setSelectedId(null);
      setEditingId(null);
      prevUserRef.current = userId;
    }
  }, [userId, clearMessages]);

  // Clear chat when selected template changes
  const prevSelectedRef = useRef(selectedId);
  useEffect(() => {
    if (prevSelectedRef.current !== selectedId) {
      clearMessages();
      setInput("");
      prevSelectedRef.current = selectedId;
    }
  }, [selectedId, clearMessages]);

  // Auto-scroll chat
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ── Sidebar resize ──

  const startResize = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!dragging.current) return;
      const clientX = "touches" in ev ? ev.touches[0].clientX : ev.clientX;
      setSidebarWidth(Math.max(140, Math.min(400, clientX)));
    };
    const onUp = () => {
      dragging.current = false;
      dragCleanupRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
    dragCleanupRef.current = onUp;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
  }, []);

  // Clean up drag listeners if component unmounts mid-drag
  useEffect(() => {
    return () => { dragCleanupRef.current?.(); };
  }, []);

  // ── Template CRUD ──

  const handleCreate = useCallback(async () => {
    if (!editTitle.trim() || !editContent.trim()) return;
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim(), content: editContent.trim(), mode: captureMode ?? "private" }),
      });
      const data = await res.json();
      if (data.template) {
        setTemplates((prev) => [data.template, ...prev]);
        setSelectedId(data.template.id);
        setEditingId(null);
        setEditTitle("");
        setEditContent("");
      }
    } catch (err) {
      console.error("Create template error:", err);
    }
  }, [editTitle, editContent, captureMode]);

  const handleUpdate = useCallback(async () => {
    if (!editingId || editingId === "new") return;
    if (!editTitle.trim()) return;
    try {
      const res = await fetch("/api/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, title: editTitle.trim(), content: editContent.trim() }),
      });
      const data = await res.json();
      if (data.updated) {
        setTemplates((prev) => prev.map((t) => (t.id === editingId ? data.template : t)));
        setEditingId(null);
        setEditTitle("");
        setEditContent("");
      }
    } catch (err) {
      console.error("Update template error:", err);
    }
  }, [editingId, editTitle, editContent]);

  const handleArchive = useCallback(async (id: string) => {
    try {
      await fetch("/api/templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      console.error("Archive template error:", err);
    }
  }, [selectedId]);

  const startEditing = useCallback((template: Template) => {
    setEditingId(template.id);
    setEditTitle(template.title);
    setEditContent(template.content);
  }, []);

  const startCreating = useCallback(() => {
    setEditingId("new");
    setEditTitle("");
    setEditContent("");
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setEditTitle("");
    setEditContent("");
    setArmedTrashId(null);
  }, []);

  // ── Visibility toggle (mirrors ReviewView pattern) ──

  function handleVisibilityClick(e: React.MouseEvent, t: Template) {
    e.stopPropagation();
    if (t.user_id !== userId) return;
    const newVis = t.visibility === "private" ? "team" : "private";
    if (newVis === "team" && captureMode !== "shared") return;
    doToggleVisibility(t);
  }

  async function doToggleVisibility(t: Template) {
    const newVis = t.visibility === "private" ? "team" : "private";
    setTemplates((prev) => prev.map((x) => x.id === t.id ? { ...x, visibility: newVis } : x));
    try {
      const res = await fetch("/api/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, visibility: newVis, mode: captureMode }),
      });
      if (!res.ok) throw new Error("PATCH failed");
    } catch {
      setTemplates((prev) => prev.map((x) => x.id === t.id ? { ...x, visibility: t.visibility } : x));
    }
  }

  // ── Send ──

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  }, [input, isStreaming, sendMessage]);

  const handleFillTemplate = useCallback(() => {
    if (isStreaming) return;
    sendMessage("Fill this out");
  }, [isStreaming, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isDesktop = window.matchMedia("(hover: hover)").matches;
    if (e.key === "Enter" && !e.shiftKey && isDesktop) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Render ──

  const renderTemplateRow = (t: Template, isOwn: boolean, index: number) => {
    const isPrivate = t.visibility === "private";
    const canToggle = isOwn && (isPrivate ? captureMode === "shared" : true);

    return (
      <button
        key={t.id}
        onClick={() => { setSelectedId(t.id); if (window.matchMedia("(max-width: 639px)").matches) setSidebarOpen(false); }}
        className="w-full text-left px-4 py-3 flex flex-col gap-1 cursor-pointer transition-colors duration-150"
        style={{
          borderBottom: "1px solid var(--border)",
          background: selectedId === t.id ? "var(--accent-dim)" : "transparent",
          animation: sidebarOpen ? `slideInLeft 250ms cubic-bezier(0.4, 0, 0.2, 1) ${index * 40}ms both` : 'none',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={(e) => canToggle ? handleVisibilityClick(e, t) : e.stopPropagation()}
              className="shrink-0 cursor-pointer transition-all duration-200"
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: isPrivate ? "#d97706" : "#3b82f6",
              }}
              title={isPrivate
                ? (canToggle ? "Click to share with team" : "Private")
                : "Shared with team"}
            >
              {isPrivate
                ? <Lock size={11} strokeWidth={2} className="opacity-50 hover:opacity-80 transition-opacity" />
                : <Users size={11} strokeWidth={2} className="opacity-50 hover:opacity-80 transition-opacity" />}
            </button>
            <span
              className="text-sm font-medium truncate"
              style={{ color: selectedId === t.id ? "var(--accent)" : "var(--text-primary)" }}
            >
              {t.title}
            </span>
          </div>
          {isOwn && (
            <span
              onClick={(e) => { e.stopPropagation(); startEditing(t); }}
              className="p-1 rounded cursor-pointer transition-opacity opacity-40 hover:opacity-100 shrink-0"
              style={{ color: "var(--text-muted)" }}
            >
              <Pencil size={12} />
            </span>
          )}
        </div>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {relativeTime(t.updated_at)}
        </span>
      </button>
    );
  };

  const renderSidebar = () => (
    <>
      <button
        onClick={startCreating}
        className="flex items-center gap-2 px-4 py-3 text-sm font-semibold cursor-pointer transition-colors duration-150 shrink-0"
        style={{
          color: "var(--accent)",
          borderBottom: "1px solid var(--border)",
          animation: sidebarOpen ? 'slideInLeft 250ms cubic-bezier(0.4, 0, 0.2, 1) both' : 'none',
        }}
      >
        <Plus size={16} />
        Add a template
      </button>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {ownTemplates.map((t, i) => renderTemplateRow(t, true, i))}
        {sharedTemplates.length > 0 && (
          <>
            <div
              className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}
            >
              Shared
            </div>
            {sharedTemplates.map((t, i) => renderTemplateRow(t, false, ownTemplates.length + i))}
          </>
        )}
        {templates.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              No templates yet. Create one to get started.
            </p>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="relative z-10 flex flex-col h-full overflow-hidden">

      {/* Header — full width, same as every other page */}
      <div
        className="px-6 pb-3 shrink-0"
        style={{ paddingTop: "calc(2rem + env(safe-area-inset-top, 0px))" }}
      >
        <div className="w-full max-w-[560px] mx-auto flex items-center gap-3">
          <button
            className="p-1 -ml-1 cursor-pointer"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ color: "var(--text-muted)" }}
            aria-label={sidebarOpen ? "Hide templates" : "Show templates"}
          >
            <List size={20} />
          </button>
          <h1
            className="font-black tracking-[-0.04em]"
            style={{ fontSize: "clamp(1.8rem, 5vw, 2.5rem)", color: "var(--text-primary)" }}
          >
            <span style={{ color: "var(--text-primary)" }}><span className="ignite-f">M</span>emory </span>
            <span className="shimmer-text" style={{ backgroundImage: theme.shimmerBg }}>templates.</span>
          </h1>
        </div>
      </div>

      {/* Sidebar + content area */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Sidebar */}
        <div
          className="shrink-0 relative flex overflow-hidden"
          style={{
            width: sidebarOpen ? `${sidebarWidth + 8}px` : '0px',
            maxWidth: '75vw',
            transition: 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div
            className="flex flex-col overflow-hidden min-h-0"
            style={{
              width: `${sidebarWidth}px`,
              minWidth: `${sidebarWidth}px`,
              margin: '8px 0 8px 8px',
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {renderSidebar()}
          </div>
          {/* Drag handle */}
          {sidebarOpen && <div
            onMouseDown={startResize}
            onTouchStart={startResize}
            className="absolute top-0 -right-1 w-2 h-full cursor-col-resize z-10 group"
          >
            <div
              className="w-px h-full mx-auto transition-colors duration-150 group-hover:w-0.5 group-hover:rounded-full"
              style={{ background: "transparent" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent)")}
              onMouseLeave={(e) => { if (!dragging.current) e.currentTarget.style.background = "transparent"; }}
            />
          </div>}
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Chat area */}
          <div className="flex-1 overflow-hidden flex flex-col px-6 pb-4">
            <div className="w-full max-w-[720px] flex-1 flex flex-col overflow-hidden">
              {selectedTemplate ? (
              <>
                {/* Template info bar */}
                <div
                  className="shrink-0 px-4 py-2.5 rounded-t-xl flex items-center justify-between"
                  style={{
                    background: "var(--accent-dim)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold truncate" style={{ color: "var(--accent)" }}>
                      {selectedTemplate.title}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Ask me to fill this out — based on your thoughts, a teammate&apos;s, or a time range.
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <button
                      onClick={handleFillTemplate}
                      disabled={isStreaming}
                      className="flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer transition-all duration-150 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: "var(--accent)", color: "var(--bg-primary)" }}
                      aria-label="Fill template"
                    >
                      <Play size={12} fill="currentColor" />
                      <span className="text-[11px] font-semibold">Fill</span>
                    </button>
                    <button
                      onClick={() => setSelectedId(null)}
                      className="p-1.5 rounded cursor-pointer transition-opacity opacity-60 hover:opacity-100"
                      style={{ color: "var(--text-muted)" }}
                      aria-label="Close"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Messages */}
                <div
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto px-4 py-4"
                  style={{ scrollBehavior: "smooth", overscrollBehavior: "contain" }}
                >
                  <div className="flex flex-col gap-4">
                    {messages.length === 0 && (
                      <div className="py-8 text-center">
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          Try: &ldquo;Fill this out based on my thoughts this week&rdquo;
                        </p>
                      </div>
                    )}
                    {messages.map((msg) => (
                      <ChatMessageBubble key={msg.id} msg={msg} formatMeta={formatMeta} isStreaming={isStreaming} />
                    ))}
                  </div>
                </div>

                {/* Input area */}
                <div className="shrink-0 pt-3 pb-2">
                  <div className="relative">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        const el = e.target;
                        el.style.transition = "none";
                        el.style.height = "0px";
                        el.offsetHeight;
                        const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
                        const padding = parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom);
                        const minH = lineHeight * 2 + padding;
                        const maxH = lineHeight * 6 + padding;
                        const clamped = Math.max(minH, Math.min(maxH, el.scrollHeight));
                        el.style.height = `${clamped}px`;
                        el.style.overflow = el.scrollHeight > maxH ? "auto" : "hidden";
                        el.style.transition = "";
                      }}
                      onKeyDown={handleKeyDown}
                      disabled={isStreaming}
                      placeholder="Ask about this template…"
                      rows={2}
                      maxLength={20000}
                      className="thought-input w-full resize-none rounded-xl pl-4 pr-14 py-3 text-sm leading-relaxed outline-none transition-all duration-200 disabled:opacity-40"
                      style={{
                        background: "var(--bg-subtle)",
                        border: "1px solid var(--border-bright)",
                        color: "var(--text-primary)",
                        fontFamily: "inherit",
                        overflow: "hidden",
                      }}
                    />
                    <button
                      onClick={handleSend}
                      disabled={!input.trim() || isStreaming}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 transition-all duration-150 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
                      style={{ background: "var(--accent-dim)" }}
                      aria-label="Send"
                    >
                      <ArrowUp size={16} color="var(--accent)" strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1" />
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Create / Edit modal */}
      {editingId !== null && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={(e) => { if (e.target === e.currentTarget) cancelEditing(); }}
        >
          <div
            className="w-full max-w-lg rounded-2xl p-6 flex flex-col gap-4"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.15)",
              maxHeight: "85vh",
            }}
          >
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {editingId === "new" ? "New Template" : "Edit Template"}
            </h2>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Template title"
              autoFocus
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-bright)",
                color: "var(--text-primary)",
              }}
            />
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Template content with placeholders…"
              rows={10}
              className="w-full rounded-lg px-4 py-3 text-sm outline-none resize-none flex-1"
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-bright)",
                color: "var(--text-primary)",
                fontFamily: "inherit",
                minHeight: "200px",
              }}
            />
            <div className="flex items-center justify-between">
              {editingId !== "new" ? (
                <button
                  onClick={() => {
                    if (armedTrashId === editingId) {
                      setArmedTrashId(null);
                      handleArchive(editingId);
                      cancelEditing();
                    } else {
                      setArmedTrashId(editingId);
                    }
                  }}
                  onBlur={() => { if (armedTrashId === editingId) setArmedTrashId(null); }}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm cursor-pointer transition-all"
                  style={{
                    color: armedTrashId === editingId ? "#fff" : "#ef4444",
                    background: armedTrashId === editingId ? "#ef4444" : "rgba(239, 68, 68, 0.1)",
                  }}
                  title={armedTrashId === editingId ? "Click again to delete" : "Delete template"}
                >
                  <Trash2 size={14} strokeWidth={armedTrashId === editingId ? 2.5 : 2} />
                  <span>{armedTrashId === editingId ? "Click again to delete" : "Delete"}</span>
                </button>
              ) : <div />}
              <div className="flex gap-2">
                <button
                  onClick={cancelEditing}
                  className="rounded-lg px-4 py-2 text-sm cursor-pointer"
                  style={{ color: "var(--text-primary)", border: "1px solid var(--border-bright)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={editingId === "new" ? handleCreate : handleUpdate}
                  disabled={!editTitle.trim() || (editingId === "new" && !editContent.trim())}
                  className="rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
                >
                  {editingId === "new" ? "Create" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
