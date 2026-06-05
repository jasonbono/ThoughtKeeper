"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Clock, Archive, Copy, Send, Sparkles, X, CalendarPlus, CircleDashed } from "lucide-react";
import { useAppStore } from "../../lib/store";
import { type Thought } from "../../lib/types";
import { ExpandableThought } from "./ExpandableThought";
import { getFormatMeta } from "../../lib/users";

/* ── Types ── */

interface OverdueNudge {
  type: "overdue";
  thought: Thought;
  daysOverdue: number;
}

interface UnscheduledNudge {
  type: "unscheduled";
  thought: Thought;
  daysSinceCreated: number;
}

interface StaleNudge {
  type: "stale";
  thought: Thought;
  daysSinceUpdate: number;
}

interface DuplicateNudge {
  type: "duplicate";
  thoughtA: Thought;
  thoughtB: Thought;
  similarity: number;
}

type ActNudge = OverdueNudge | UnscheduledNudge | StaleNudge;

interface PulseData {
  act: ActNudge[];
  think: DuplicateNudge[];
  counts: { overdue: number; unscheduled: number; stale: number; duplicates: number; total: number };
}

interface AiSection {
  id: string;
  title: string;
  thoughts: Record<string, unknown>[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/* ── Main component ── */

export default function PulseView() {
  const theme = useAppStore((s) => s.theme);
  const formatMeta = useMemo(() => getFormatMeta(), []);

  // Nudge state
  const [data, setData] = useState<PulseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const fetchGenRef = useRef(0);

  // Chat state
  const [chatInput, setChatInput] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [aiSections, setAiSections] = useState<AiSection[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchNudges = useCallback(() => {
    fetchGenRef.current += 1;
    const gen = fetchGenRef.current;
    setLoading(true);
    fetch("/api/pulse/nudges")
      .then((r) => r.json())
      .then((d) => {
        if (gen !== fetchGenRef.current) return;
        setData(d as PulseData);
        setDismissed(new Set());
      })
      .catch((err) => console.error("Pulse fetch error:", err))
      .finally(() => {
        if (gen === fetchGenRef.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchNudges();
  }, [fetchNudges]);

  // Filter dismissed items and split by type
  const actNudges = (data?.act ?? []).filter((n) => !dismissed.has(n.thought.id));
  const overdueNudges = actNudges.filter((n): n is OverdueNudge => n.type === "overdue");
  const unscheduledNudges = actNudges.filter((n): n is UnscheduledNudge => n.type === "unscheduled");
  const staleNudges = actNudges.filter((n): n is StaleNudge => n.type === "stale");
  const thinkNudges = (data?.think ?? []).filter(
    (n) => !dismissed.has(n.thoughtA.id) && !dismissed.has(n.thoughtB.id)
  );
  const totalActive = actNudges.length + thinkNudges.length;

  const handleMutate = useCallback((id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  }, []);

  // Bulk action: archive all thoughts in a list
  const handleBulkArchive = useCallback(async (nudges: ActNudge[]) => {
    const ids = nudges.map((n) => n.thought.id);
    setDismissed((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/capture/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        })
      )
    );
  }, []);

  // Bulk action: defer all overdue todos to tomorrow
  const handleBulkDefer = useCallback(async (nudges: OverdueNudge[]) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const dueAt = tomorrow.toISOString();
    await Promise.allSettled(
      nudges.map((n) =>
        fetch(`/api/capture/${n.thought.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ due_at: dueAt }),
        })
      )
    );
    fetchNudges();
  }, [fetchNudges]);

  // Bulk action: snooze all unscheduled todos until tomorrow (no due_at change)
  const handleBulkSnooze = useCallback(async (nudges: UnscheduledNudge[]) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const snoozedUntil = tomorrow.toISOString();
    await Promise.allSettled(
      nudges.map((n) =>
        fetch(`/api/capture/${n.thought.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snoozed_until: snoozedUntil }),
        })
      )
    );
    fetchNudges();
  }, [fetchNudges]);

  // Individual snooze: snooze one thought until tomorrow
  const handleSnooze = useCallback(async (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await fetch(`/api/capture/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snoozed_until: tomorrow.toISOString() }),
    });
  }, []);

  // Build pulse context string for the AI
  const pulseContext = useMemo(() => {
    if (!data) return "Pulse is loading.";
    const lines: string[] = [];
    lines.push(`Counts: ${data.counts.overdue} overdue, ${data.counts.unscheduled} unscheduled, ${data.counts.stale} stale, ${data.counts.duplicates} duplicate pairs.`);
    for (const n of data.act) {
      if (n.type === "overdue") {
        lines.push(`[overdue] "${n.thought.title}" (id: ${n.thought.id}) — ${n.daysOverdue} days overdue`);
      } else if (n.type === "unscheduled") {
        lines.push(`[unscheduled] "${n.thought.title}" (id: ${n.thought.id}) — no due date, created ${n.daysSinceCreated} days ago`);
      } else {
        lines.push(`[stale] "${n.thought.title}" (id: ${n.thought.id}) — untouched ${n.daysSinceUpdate} days`);
      }
    }
    for (const n of data.think) {
      const pct = Math.round(n.similarity * 100);
      lines.push(`[duplicate] "${n.thoughtA.title}" & "${n.thoughtB.title}" — ${pct}% similar`);
    }
    return lines.join("\n");
  }, [data]);

  // Chat send handler
  const handleSend = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || isStreaming) return;

    setChatInput("");
    setAiMessage("");
    setIsStreaming(true);

    const newHistory: ChatMessage[] = [
      ...chatHistory,
      { role: "user", content: text },
    ];
    setChatHistory(newHistory);

    // Keep last 6 messages (3 exchanges) for context
    const messagesToSend = newHistory.slice(-6);

    const controller = new AbortController();
    abortRef.current = controller;

    let pendingSectionTitle = "";

    try {
      const res = await fetch("/api/pulse/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messagesToSend,
          pulseContext,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setAiMessage("Something went wrong. Try again.");
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ") && eventType) {
            try {
              const payload = JSON.parse(line.slice(6));

              if (eventType === "text") {
                fullText += payload.text;
                setAiMessage(fullText);
              } else if (eventType === "tool_call") {
                if (payload.name === "query_thoughts" && payload.input?.section_title) {
                  pendingSectionTitle = payload.input.section_title;
                }
              } else if (eventType === "tool_result") {
                if (
                  payload.name === "query_thoughts" &&
                  payload.result?.thoughts?.length > 0
                ) {
                  const title = payload.section_title || pendingSectionTitle || "Results";
                  setAiSections((prev) => [
                    ...prev,
                    {
                      id: `ai-${Date.now()}-${Math.random()}`,
                      title,
                      thoughts: payload.result.thoughts,
                    },
                  ]);
                  pendingSectionTitle = "";
                }
              }
            } catch {
              // ignore parse errors
            }
            eventType = "";
          }
        }
      }

      if (fullText) {
        setChatHistory((prev) => [
          ...prev,
          { role: "assistant", content: fullText },
        ]);
      }
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) {
        setAiMessage("Something went wrong. Try again.");
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [chatInput, isStreaming, chatHistory, pulseContext]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isDesktop = window.matchMedia("(hover: hover)").matches;
    if (e.key === "Enter" && !e.shiftKey && isDesktop) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearAiSections = useCallback(() => {
    setAiSections([]);
    setAiMessage("");
    setChatHistory([]);
  }, []);

  // Abort streaming on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Scroll to bottom when AI sections are added
  useEffect(() => {
    if (aiSections.length > 0 && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [aiSections.length]);

  return (
    <div className="relative z-10 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="px-6 pb-3 shrink-0"
        style={{ paddingTop: "calc(2rem + env(safe-area-inset-top, 0px))" }}
      >
        <div className="w-full max-w-[560px] mx-auto">
          <h1
            className="font-black tracking-[-0.04em]"
            style={{
              fontSize: "clamp(1.8rem, 5vw, 2.5rem)",
              color: "var(--text-primary)",
            }}
          >
            <span style={{ color: "var(--text-primary)" }}>
              <span className="ignite-f">D</span>aily{" "}
            </span>
            <span
              className="shimmer-text"
              style={{ backgroundImage: theme.shimmerBg }}
            >
              pulse.
            </span>
          </h1>
          <p
            className="mt-1"
            style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}
          >
            {loading
              ? "Checking in\u2026"
              : totalActive === 0
                ? "You\u2019re in sync"
                : `${totalActive} ${totalActive === 1 ? "thing needs" : "things need"} your attention`}
          </p>
        </div>
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pb-4">
        <div className="w-full max-w-[560px] mx-auto">
          {loading ? (
            <div
              className="flex items-center justify-center"
              style={{ height: "200px" }}
            >
              <span
                className="dot-pulse"
                style={{ color: "var(--text-muted)" }}
              />
            </div>
          ) : totalActive === 0 && aiSections.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {/* Act section */}
              {actNudges.length > 0 && (
                <Section title="Act" count={actNudges.length}>
                  {overdueNudges.length > 0 && (
                    <NudgeGroup
                      type="overdue"
                      nudges={overdueNudges}
                      formatMeta={formatMeta}
                      onMutate={handleMutate}
                      onSnooze={handleSnooze}
                      onBulkArchive={() => handleBulkArchive(overdueNudges)}
                      onBulkDefer={() => handleBulkDefer(overdueNudges)}
                    />
                  )}
                  {unscheduledNudges.length > 0 && (
                    <NudgeGroup
                      type="unscheduled"
                      nudges={unscheduledNudges}
                      formatMeta={formatMeta}
                      onMutate={handleMutate}
                      onSnooze={handleSnooze}
                      onBulkArchive={() => handleBulkArchive(unscheduledNudges)}
                      onBulkSnooze={() => handleBulkSnooze(unscheduledNudges)}
                    />
                  )}
                  {staleNudges.length > 0 && (
                    <NudgeGroup
                      type="stale"
                      nudges={staleNudges}
                      formatMeta={formatMeta}
                      onMutate={handleMutate}
                      onSnooze={handleSnooze}
                      onBulkArchive={() => handleBulkArchive(staleNudges)}
                    />
                  )}
                </Section>
              )}

              {/* Think section */}
              {thinkNudges.length > 0 && (
                <Section title="Think" count={thinkNudges.length}>
                  {thinkNudges.map((nudge) => (
                    <DuplicateCard
                      key={nudge.thoughtA.id + nudge.thoughtB.id}
                      nudge={nudge}
                      formatMeta={formatMeta}
                      onMutate={handleMutate}
                    />
                  ))}
                </Section>
              )}

              {/* AI-surfaced sections */}
              {aiSections.length > 0 && (
                <div style={{ position: "relative" }}>
                  <button
                    onClick={clearAiSections}
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "0.1rem",
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: "0.25rem",
                    }}
                    aria-label="Clear AI sections"
                  >
                    <X size={14} />
                  </button>
                  {aiSections.map((section) => (
                    <Section
                      key={section.id}
                      title={section.title}
                      count={section.thoughts.length}
                      ai
                    >
                      {section.thoughts.map((t) => {
                        const id = (t.id ?? t.thought_id ?? "") as string;
                        return (
                          <div
                            key={id}
                            style={{
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              borderRadius: "12px",
                              padding: "0.75rem",
                            }}
                          >
                            <ExpandableThought
                              data={{ saved: true, ...t }}
                              formatMeta={formatMeta}
                              variant="listed"
                              onMutate={handleMutate}
                            />
                          </div>
                        );
                      })}
                    </Section>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* AI message bubble — just above chat input */}
      {aiMessage && (
        <div
          className="shrink-0 px-6"
          style={{ borderTop: "1px solid var(--border)", paddingTop: "0.5rem" }}
        >
          <div
            className="w-full max-w-[560px] mx-auto"
            style={{
              background: "var(--accent-dim)",
              border: "1px solid var(--accent)",
              borderRadius: "12px",
              padding: "0.65rem 0.85rem",
              marginBottom: "0.5rem",
              fontSize: "0.85rem",
              lineHeight: 1.5,
              color: "var(--text-primary)",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.5rem",
              maxHeight: "30vh",
              overflowY: "auto",
            }}
          >
            <Sparkles
              size={14}
              style={{
                color: "var(--accent)",
                flexShrink: 0,
                marginTop: "0.15rem",
              }}
            />
            <span style={{ flex: 1 }}>{aiMessage}</span>
          </div>
        </div>
      )}

      {/* Chat input */}
      <div
        className="shrink-0 px-6 pb-4 pt-2"
        style={{
          paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
          ...(!aiMessage ? { borderTop: "1px solid var(--border)" } : {}),
        }}
      >
        <div className="w-full max-w-[560px] mx-auto relative">
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder="Ask about your pulse..."
            rows={1}
            maxLength={500}
            className="thought-input w-full resize-none rounded-xl pl-4 pr-12 py-3 text-sm leading-relaxed outline-none transition-all duration-200 disabled:opacity-40"
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
            disabled={!chatInput.trim() || isStreaming}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 transition-all duration-150 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
            style={{ background: "var(--accent-dim)" }}
            aria-label="Send"
          >
            {isStreaming ? (
              <span
                className="dot-pulse"
                style={{ color: "var(--accent)", transform: "scale(0.6)" }}
              />
            ) : (
              <Send size={14} color="var(--accent)" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Section wrapper ── */

function Section({
  title,
  count,
  children,
  ai,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  ai?: boolean;
}) {
  return (
    <div style={{ marginBottom: "2rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "0.75rem",
        }}
      >
        {ai && (
          <Sparkles
            size={12}
            style={{ color: "var(--accent)", flexShrink: 0 }}
          />
        )}
        <h2
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: ai ? "var(--accent)" : "var(--text-muted)",
          }}
        >
          {title}
        </h2>
        <span
          style={{
            fontSize: "0.7rem",
            fontWeight: 500,
            color: "var(--text-muted)",
            background: "var(--surface-raised, var(--border))",
            padding: "0.1rem 0.45rem",
            borderRadius: "4px",
          }}
        >
          {count}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {children}
      </div>
    </div>
  );
}

/* ── Nudge group (overdue or stale) ── */

function NudgeGroup({
  type,
  nudges,
  formatMeta,
  onMutate,
  onSnooze,
  onBulkArchive,
  onBulkDefer,
  onBulkSnooze,
}: {
  type: "overdue" | "unscheduled" | "stale";
  nudges: ActNudge[];
  formatMeta: Record<string, import("../../lib/users").FormatConfig>;
  onMutate: (id: string) => void;
  onSnooze: (id: string) => void;
  onBulkArchive: () => void;
  onBulkDefer?: () => void;
  onBulkSnooze?: () => void;
}) {
  const groupConfig = {
    overdue: { label: "Overdue", icon: <Clock size={11} />, accent: true },
    unscheduled: { label: "Unscheduled", icon: <CircleDashed size={11} />, accent: false },
    stale: { label: "Stale", icon: <Archive size={11} />, accent: false },
  }[type];

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "0.75rem",
      }}
    >
      {/* Group header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.6rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
              fontSize: "0.65rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: groupConfig.accent ? "var(--accent)" : "var(--text-muted)",
              background: groupConfig.accent
                ? "var(--accent-dim)"
                : "var(--surface-raised, var(--border))",
              padding: "0.2rem 0.5rem",
              borderRadius: "5px",
            }}
          >
            {groupConfig.icon}
            {groupConfig.label}
          </div>
          <span
            style={{
              fontSize: "0.65rem",
              color: "var(--text-muted)",
            }}
          >
            {nudges.length}
          </span>
        </div>

        {/* Bulk actions */}
        <div style={{ display: "flex", gap: "0.35rem" }}>
          {type === "overdue" && onBulkDefer && (
            <GroupActionButton
              icon={<CalendarPlus size={11} />}
              label="Defer +1d"
              onClick={onBulkDefer}
            />
          )}
          {type === "unscheduled" && onBulkSnooze && (
            <GroupActionButton
              icon={<Clock size={11} />}
              label="for all"
              onClick={onBulkSnooze}
            />
          )}
          <GroupActionButton
            icon={<Archive size={11} />}
            label="Archive all"
            onClick={onBulkArchive}
          />
        </div>
      </div>

      {/* Individual items */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {nudges.map((nudge) => {
          let label: string;
          if (nudge.type === "overdue") {
            label = formatDueLabel((nudge as OverdueNudge).daysOverdue);
          } else if (nudge.type === "unscheduled") {
            const days = (nudge as UnscheduledNudge).daysSinceCreated;
            label = days === 0 ? "Created today" : `Created ${days} ${days === 1 ? "day" : "days"} ago`;
          } else {
            label = `Untouched ${(nudge as StaleNudge).daysSinceUpdate} days`;
          }
          return (
            <div
              key={nudge.thought.id}
              style={{
                borderTop: "1px solid var(--border)",
                paddingTop: "0.4rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.65rem",
                  color:
                    nudge.type === "overdue" ? "#f87171" : "var(--text-muted)",
                  display: "block",
                  marginBottom: "0.25rem",
                }}
              >
                {label}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <ExpandableThought
                    data={
                      { saved: true, ...nudge.thought } as Record<string, unknown>
                    }
                    formatMeta={formatMeta}
                    variant="listed"
                    onMutate={(id, action) => {
                      if (action === "archived" || action === "trashed")
                        onMutate(id);
                    }}
                  />
                </div>
                <button
                  onClick={() => onSnooze(nudge.thought.id)}
                  title="Snooze until tomorrow"
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "28px",
                    height: "28px",
                    borderRadius: "6px",
                    border: "none",
                    background: "var(--surface-raised, var(--border))",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                  aria-label="Snooze until tomorrow"
                >
                  <Clock size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Group action button ── */

function GroupActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        fontSize: "0.6rem",
        fontWeight: 500,
        color: "var(--text-muted)",
        background: "var(--surface-raised, var(--border))",
        border: "none",
        borderRadius: "5px",
        padding: "0.2rem 0.5rem",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

/* ── Duplicate pair card ── */

function DuplicateCard({
  nudge,
  formatMeta,
  onMutate,
}: {
  nudge: DuplicateNudge;
  formatMeta: Record<string, import("../../lib/users").FormatConfig>;
  onMutate: (id: string) => void;
}) {
  const pct = Math.round(nudge.similarity * 100);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "0.75rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "0.5rem",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            fontSize: "0.65rem",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-muted)",
            background: "var(--surface-raised, var(--border))",
            padding: "0.2rem 0.5rem",
            borderRadius: "5px",
          }}
        >
          <Copy size={11} />
          Possible duplicate
        </div>
        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
          {pct}% similar
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.5rem",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <ExpandableThought
            data={
              { saved: true, ...nudge.thoughtA } as Record<string, unknown>
            }
            formatMeta={formatMeta}
            variant="listed"
            onMutate={(id, action) => {
              if (action === "archived" || action === "trashed") onMutate(id);
            }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <ExpandableThought
            data={
              { saved: true, ...nudge.thoughtB } as Record<string, unknown>
            }
            formatMeta={formatMeta}
            variant="listed"
            onMutate={(id, action) => {
              if (action === "archived" || action === "trashed") onMutate(id);
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Empty state ── */

function EmptyState() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: "6rem",
        gap: "1rem",
      }}
    >
      <div
        style={{
          width: "64px",
          height: "64px",
          borderRadius: "50%",
          background: "var(--accent-dim)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--accent)",
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
        </svg>
      </div>
      <div
        style={{
          fontSize: "1.1rem",
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        All caught up
      </div>
      <div
        style={{
          fontSize: "0.85rem",
          color: "var(--text-muted)",
          textAlign: "center",
          lineHeight: 1.5,
          maxWidth: "240px",
        }}
      >
        Nothing needs your attention right now. Ask below to surface more
        thoughts.
      </div>
    </div>
  );
}

/* ── Helpers ── */

function formatDueLabel(daysOverdue: number): string {
  if (daysOverdue === 0) return "Due today";
  if (daysOverdue === 1) return "1 day overdue";
  return `${daysOverdue} days overdue`;
}
