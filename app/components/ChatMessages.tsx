"use client";

import ReactMarkdown from "react-markdown";
import type { DisplayMessage, ToolEvent } from "../../lib/types";
import type { FormatConfig } from "../../lib/users";
import { ExpandableThought } from "./ExpandableThought";
import ClickableImage from "./ClickableImage";

// ── Tool call indicator ──

const TOOL_LABELS: Record<string, string> = {
  save_thought: "Saving thought\u2026",
  query_thoughts: "Searching thoughts\u2026",
  update_thought: "Updating thought\u2026",
  manage_topics: "Managing topics\u2026",
};

function ToolCallIndicator({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 my-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
      <span
        className="dot-pulse inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: "var(--accent)" }}
      />
      {TOOL_LABELS[name] ?? "Working\u2026"}
    </div>
  );
}

// ── Recall stats ──

function RecallStats({ toolEvents, resultIndex }: { toolEvents: ToolEvent[]; resultIndex: number }) {
  const result = toolEvents[resultIndex].data;
  const count = result.count as number;
  const totalBeforeLimit = result.total_before_limit as number | undefined;
  const totalPool = result.total_pool as number | undefined;
  const thoughts = result.thoughts as Array<{ created_at: string }> | undefined;

  // Get search params from the tool_result event's embedded input
  const input = toolEvents[resultIndex].input ?? null;

  const query = input?.query as string | undefined;
  const format = input?.format as string | undefined;
  const dateFrom = input?.date_from as string | undefined;
  const dateTo = input?.date_to as string | undefined;
  const topic = input?.topic as string | undefined;

  // Compute date span from returned thoughts
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  let dateSpan = "";
  if (thoughts && thoughts.length >= 2) {
    const dates = thoughts.map(t => new Date(t.created_at)).sort((a, b) => a.getTime() - b.getTime());
    const oldest = fmt(dates[0]);
    const newest = fmt(dates[dates.length - 1]);
    dateSpan = oldest === newest ? oldest : `${oldest} \u2013 ${newest}`;
  } else if (thoughts?.length === 1) {
    dateSpan = fmt(new Date(thoughts[0].created_at));
  }

  // Build description
  const parts: string[] = [];

  // Pool + search
  if (totalPool != null && query) {
    parts.push(`Searched ${totalPool} thoughts for \u201c${query}\u201d`);
  } else if (totalPool != null) {
    parts.push(`Searched ${totalPool} thoughts`);
  } else if (query) {
    parts.push(`Searched for \u201c${query}\u201d`);
  }

  // Match count
  if (totalBeforeLimit != null && totalBeforeLimit > count) {
    parts.push(`${count} of ${totalBeforeLimit} returned`);
  } else {
    parts.push(`${count} returned`);
  }

  // Filters
  const filters: string[] = [];
  if (format) filters.push(format + "s");
  if (topic) filters.push(topic);
  if (dateFrom || dateTo) {
    if (dateFrom && dateTo) filters.push(`${dateFrom} to ${dateTo}`);
    else if (dateFrom) filters.push(`from ${dateFrom}`);
    else filters.push(`through ${dateTo}`);
  }
  if (filters.length) parts.push(filters.join(", "));

  // Date span of actual results (skip if explicit date filter)
  if (dateSpan && !dateFrom && !dateTo) parts.push(dateSpan);

  if (parts.length === 0) return null;

  return (
    <div
      className="text-[11px] my-1.5 leading-tight"
      style={{ color: "var(--text-muted)" }}
    >
      {parts.join(" \u00b7 ")}
    </div>
  );
}

// ── Message bubble ──

interface ChatMessageBubbleProps {
  msg: DisplayMessage;
  formatMeta: Record<string, FormatConfig>;
  isStreaming: boolean;
}

export function ChatMessageBubble({ msg, formatMeta, isStreaming }: ChatMessageBubbleProps) {
  return (
    <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] rounded-xl px-4 py-3"
        style={
          msg.role === "user"
            ? { background: "var(--user-bubble-bg)", border: "1px solid var(--user-bubble-border)" }
            : { background: "var(--surface)", border: "1px solid var(--border)" }
        }
      >
        {msg.role === "assistant" && (() => {
          // Find the last tool_result index for each query tool so earlier results
          // are superseded (only the last search per tool renders cards)
          const lastResultIdx = new Map<string, number>();
          const QUERY_TOOLS = new Set(["query_thoughts", "search_trash"]);
          msg.toolEvents.forEach((te, i) => {
            if (te.type === "tool_result" && QUERY_TOOLS.has(te.name)) {
              lastResultIdx.set(te.name, i);
            }
          });

          return (
          <>
            {msg.toolEvents.map((te, i) => {
              if (te.type === "tool_call") {
                const hasResult = msg.toolEvents.some(
                  (e, j) => j > i && e.type === "tool_result" && e.name === te.name
                );
                if (hasResult) return null;
                return <ToolCallIndicator key={i} name={te.name} />;
              }
              if (te.type === "tool_result") {
                const result = te.data;
                if (result.error) {
                  return (
                    <div
                      key={i}
                      className="text-xs my-1.5 px-2.5 py-1.5 rounded-md"
                      style={{ background: "var(--error-bg)", color: "var(--error)", border: "1px solid var(--error-border)" }}
                    >
                      {String(result.error)}
                    </div>
                  );
                }
                if (
                  (te.name === "save_thought" && result.saved) ||
                  (te.name === "update_thought" && result.updated) ||
                  (te.name === "thought_lifecycle" && result.thought)
                ) {
                  return <ExpandableThought key={i} data={result} formatMeta={formatMeta} />;
                }
                // Only render cards from the last result of each query tool
                const isSuperseded = QUERY_TOOLS.has(te.name) && lastResultIdx.get(te.name) !== i;

                // Show recall stats for query_thoughts (always, including silent/superseded)
                const showStats = te.name === "query_thoughts" && result.total_pool != null;
                const showCards = !isSuperseded && result.display !== "silent";

                if (showStats || showCards) {
                  const allItems: Record<string, unknown>[] = [];
                  if (showCards) {
                    for (const key of ["thoughts", "trashed_thoughts"] as const) {
                      const arr = result[key];
                      if (Array.isArray(arr)) allItems.push(...(arr as Record<string, unknown>[]));
                    }
                  }
                  if (showStats || allItems.length > 0) {
                    return (
                      <div key={i} className="flex flex-col gap-1">
                        {showStats && <RecallStats toolEvents={msg.toolEvents} resultIndex={i} />}
                        {allItems.map((c, ci) => (
                          <ExpandableThought key={ci} data={{ saved: true, ...c }} formatMeta={formatMeta} variant="listed" />
                        ))}
                      </div>
                    );
                  }
                }
                return null;
              }
              return null;
            })}
            {msg.text ? (
              <div className="prose-chat text-sm leading-relaxed">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
            ) : (
              !msg.toolEvents.length &&
              isStreaming && (
                <div className="flex items-center gap-2">
                  <span
                    className="dot-pulse inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: "var(--accent)" }}
                  />
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                    Thinking&hellip;
                  </span>
                </div>
              )
            )}
          </>
          );
        })()}
        {msg.role === "user" && (
          <div className="flex flex-col gap-2">
            {msg.imageDataUrl && (
              <ClickableImage
                src={msg.imageDataUrl}
                alt="Attached"
                className="rounded-lg max-w-full max-h-48 object-contain"
              />
            )}
            {msg.text && (
              <div
                className="text-sm leading-relaxed whitespace-pre-wrap"
                style={{ color: "var(--text-primary)" }}
              >
                {msg.text}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
