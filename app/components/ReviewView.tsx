"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getFormatMeta, getFormatOrder } from "../../lib/users";
import { Trash2 } from "lucide-react";
import { useAppStore } from "../../lib/store";
import { type ViewScope, type ThoughtRow } from "./review/types";
import { ActiveArchivedToggle } from "./review/ActiveArchivedToggle";
import { ViewScopeToggle } from "./review/ViewScopeToggle";
import { DateNavigator } from "./review/DateNavigator";
import { SearchBar } from "./review/SearchBar";
import { ViewModeToggle } from "./review/ViewModeToggle";
import { FormatFilterBar } from "./review/FormatFilterBar";
import { TopicFilterBar } from "./review/TopicFilterBar";
import { ThoughtCard } from "./review/ThoughtCard";
import { useThoughtActions } from "./review/useThoughtActions";
import { buildSections, todayNY, shiftDate, formatDateHeading } from "./review/buildSections";

export default function ReviewView() {
  const refreshKey = useAppStore(s => s.refreshKey);
  const userId = useAppStore(s => s.userId)!;
  const theme = useAppStore(s => s.theme);
  const captureMode = useAppStore(s => s.captureMode);
  const highlightThoughtId = useAppStore(s => s.highlightThoughtId);
  const tz = useAppStore(s => s.timezone);

  const handleThoughtUpdate = useCallback((id: string, updated: ThoughtRow) => {
    const updater = (prev: ThoughtRow[]) => prev.map(t => t.id === id ? { ...t, ...updated } : t);
    setThoughts(updater);
    setSearchResults(prev => prev ? updater(prev) : prev);
  }, []);

  const [viewScope, setViewScope] = useState<ViewScope>(userId);

  const formatMetaMap = useMemo(() => getFormatMeta(), []);
  const formatOrder = useMemo(() => getFormatOrder(), []);

  const [thoughts, setThoughts] = useState<ThoughtRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [showingArchived, setShowingArchived] = useState(false);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(() => new Set(formatOrder));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"chrono" | "format">("chrono");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ThoughtRow[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeTopics, setActiveTopics] = useState<Set<string> | null>(null); // null = no topic filter

  const hasLoadedRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fetchGenRef = useRef(0);

  const {
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
  } = useThoughtActions({
    userId,
    captureMode,
    showingArchived,
    thoughts,
    searchResults,
    expandedIds,
    setThoughts,
    setSearchResults,
  });

  // When the active user changes (identity toggle), reset view scope to match
  useEffect(() => {
    setViewScope(userId);
  }, [userId]);

  // Reset format/topic filters when view scope changes
  useEffect(() => {
    setActiveFormats(new Set(formatOrder));
    setActiveTopics(null);
    setExpandedIds(new Set());
    setSearchQuery("");
  }, [viewScope, formatOrder]);

  const PAGE_SIZE = 50;

  const fetchThoughts = useCallback((archived: boolean, date: string | null, scope: ViewScope) => {
    fetchGenRef.current += 1;
    const gen = fetchGenRef.current;
    if (!hasLoadedRef.current) setLoading(true);
    const params = new URLSearchParams();
    if (archived) params.set("archived", "true");
    if (date) params.set("date", date);
    if (scope === "all") params.set("view", "all");
    else if (scope !== userId) params.set("view", scope);
    // Use pagination when not filtering by date
    if (!date) params.set("limit", String(PAGE_SIZE));
    const qs = params.toString();
    fetch(`/api/captures?${qs}`)
      .then((r) => r.json())
      .then((data) => {
        if (gen !== fetchGenRef.current) return;
        hasLoadedRef.current = true;
        setThoughts(data.thoughts ?? []);
        setNextCursor(data.nextCursor ?? null);
      })
      .catch(() => { if (gen === fetchGenRef.current) { setThoughts([]); setNextCursor(null); } })
      .finally(() => { if (gen === fetchGenRef.current) setLoading(false); });
  }, [userId]);

  const fetchMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    const gen = fetchGenRef.current;
    setLoadingMore(true);
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("cursor", nextCursor);
    if (showingArchived) params.set("archived", "true");
    if (viewScope === "all") params.set("view", "all");
    else if (viewScope !== userId) params.set("view", viewScope);
    fetch(`/api/captures?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (gen !== fetchGenRef.current) return;
        const newThoughts = data.thoughts ?? [];
        setThoughts((prev) => [...prev, ...newThoughts]);
        setNextCursor(data.nextCursor ?? null);
      })
      .catch(() => { if (gen === fetchGenRef.current) setNextCursor(null); })
      .finally(() => { if (gen === fetchGenRef.current) setLoadingMore(false); });
  }, [nextCursor, loadingMore, showingArchived, viewScope, userId]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchMore]);

  // When switching back to the review view, always reset to "show all"
  useEffect(() => {
    setSelectedDate(null);
    if (!highlightThoughtId) {
      setExpandedIds(new Set());
    }
  }, [refreshKey, highlightThoughtId]);

  // Scroll to and highlight a thought when navigating from capture
  useEffect(() => {
    if (!highlightThoughtId || loading) return;
    setExpandedIds(new Set([highlightThoughtId]));
    const scrollTimer = setTimeout(() => {
      const el = document.getElementById(`thought-${highlightThoughtId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("thought-highlighted");
      }
    }, 300);
    const removeTimer = setTimeout(() => {
      const el = document.getElementById(`thought-${highlightThoughtId}`);
      if (el) el.classList.remove("thought-highlighted");
    }, 4300);
    return () => { clearTimeout(scrollTimer); clearTimeout(removeTimer); };
  }, [highlightThoughtId, loading]);

  useEffect(() => {
    fetchThoughts(showingArchived, selectedDate, viewScope);
  }, [refreshKey, showingArchived, selectedDate, fetchThoughts, viewScope]);

  // Debounced hybrid search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const abortController = new AbortController();
    searchTimerRef.current = setTimeout(() => {
      const params = new URLSearchParams({ q: searchQuery.trim() });
      if (showingArchived) params.set("archived", "true");
      if (viewScope === "all") params.set("view", "all");
      else params.set("view", viewScope);

      fetch(`/api/search?${params}`, { signal: abortController.signal })
        .then(r => r.json())
        .then(data => setSearchResults(data.thoughts ?? []))
        .catch((e) => { if (e.name !== "AbortError") setSearchResults([]); })
        .finally(() => { if (!abortController.signal.aborted) setSearchLoading(false); });
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      abortController.abort();
    };
  }, [searchQuery, showingArchived, viewScope]);

  function soloFormat(b: string) {
    setActiveFormats((prev) => {
      if (prev.size === 1 && prev.has(b)) {
        return new Set(formatOrder);
      }
      return new Set([b]);
    });
  }

  function dragToggleFormat(b: string) {
    setActiveFormats((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function switchMode(toArchived: boolean) {
    setShowingArchived(toArchived);
    setActiveTopics(null);
    setExpandedIds(new Set());
    setSearchQuery("");
  }

  function navigateDate(direction: -1 | 1) {
    const current = selectedDate ?? todayNY(tz);
    const next = shiftDate(current, direction);
    setSelectedDate(next);
    setExpandedIds(new Set());
  }

  /** Whether to show name tags on thoughts (viewing another user or "both"). */
  const showNameTags = viewScope !== userId;

  // When searching, use server-ranked results; otherwise use the full local list
  const baseFiltered = searchResults !== null ? searchResults : thoughts;

  // Apply topic filter
  const filtered = activeTopics !== null
    ? baseFiltered.filter((t) => t.topics?.some((tn) => activeTopics.has(tn)))
    : baseFiltered;

  // Compute counts from unfiltered thoughts (so counts remain stable while filtering)
  const formatCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of thoughts) {
      counts.set(t.format, (counts.get(t.format) ?? 0) + 1);
    }
    return counts;
  }, [thoughts]);

  const topicCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of thoughts) {
      if (t.topics) {
        for (const tn of t.topics) {
          counts.set(tn, (counts.get(tn) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [thoughts]);

  const isSearching = searchResults !== null;
  const showFormatSticker = (viewMode === "chrono" || isSearching) && !showingArchived;

  const sections = buildSections({
    isSearching,
    showingArchived,
    viewMode,
    filtered,
    activeFormats,
    formatOrder,
    formatMetaMap,
    tz,
  });

  const totalVisible = sections.reduce((n, s) => n + s.rows.length, 0);

  return (
    <div
      className="relative z-10 min-h-screen flex flex-col"
      style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {/* Header */}
      <div
        className="px-6 pb-3 shrink-0"
        style={{ paddingTop: "calc(2rem + env(safe-area-inset-top, 0px))" }}
      >
        <div className="w-full max-w-[560px] mx-auto">
          <h1
            className="font-black tracking-[-0.04em]"
            style={{ fontSize: "clamp(1.8rem, 5vw, 2.5rem)", color: "var(--text-primary)" }}
          >
            {selectedDate ? formatDateHeading(selectedDate, tz) : (<>
              <span style={{ color: "var(--text-primary)" }}><span className="ignite-f">Y</span>our </span>
              <span className="shimmer-text" style={{ backgroundImage: theme.shimmerBg }}>thoughts.</span>
            </>)}
          </h1>
        </div>
      </div>

      <div className="w-full max-w-[560px] mx-auto flex flex-col gap-6 px-6">

        <ActiveArchivedToggle showingArchived={showingArchived} onSwitch={switchMode} />

        <ViewScopeToggle viewScope={viewScope} onScopeChange={setViewScope} currentUser={userId} />

        <DateNavigator
          selectedDate={selectedDate}
          onNavigate={navigateDate}
          onReset={() => { setSelectedDate(null); setExpandedIds(new Set()); }}
        />

        <SearchBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />

        {!showingArchived && (
          <ViewModeToggle viewMode={viewMode} onModeChange={setViewMode} />
        )}

        {!showingArchived && (
          <FormatFilterBar
            formatOrder={formatOrder}
            formatMetaMap={formatMetaMap}
            activeFormats={activeFormats}
            formatCounts={formatCounts}
            onSoloFormat={soloFormat}
            onDragToggleFormat={dragToggleFormat}
            onResetFormats={() => setActiveFormats(new Set(formatOrder))}
          />
        )}

        {!showingArchived && userTopics.length > 0 && (
          <TopicFilterBar
            userTopics={userTopics}
            activeTopics={activeTopics}
            topicCounts={topicCounts}
            onToggleTopic={(topicName) => {
              setActiveTopics((prev) => {
                if (prev === null) {
                  return new Set([topicName]);
                }
                if (prev.size === 1 && prev.has(topicName)) {
                  return null;
                }
                return new Set([topicName]);
              });
            }}
            onResetTopics={() => setActiveTopics(null)}
          />
        )}

        <div className="section-divider" />

        <div>
          {loading || searchLoading ? (
            <p className="text-sm animate-pulse" style={{ color: "var(--text-secondary)" }}>
              {searchLoading ? "Searching…" : "Loading…"}
            </p>
          ) : totalVisible === 0 && !showingArchived ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {searchQuery
                ? "No matches."
                : thoughts.length === 0
                  ? (selectedDate ? "Nothing on this day." : "No thoughts yet.")
                  : "Nothing in the selected formats."}
            </p>
          ) : thoughts.length === 0 && showingArchived ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              No archived items.
            </p>
          ) : (
            <div className="flex flex-col gap-8">
              {sections.map((section) => {
                return (
                  <div key={section.key} className="flex flex-col gap-2">
                    <div
                      className="flex items-center gap-2 pb-2"
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      {section.dot && (
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={section.dot}
                        />
                      )}
                      <span
                        className="text-[10px] font-bold uppercase tracking-[0.15em]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {section.label}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        · {section.rows.length}
                      </span>
                    </div>

                    {section.rows.map((row) => (
                      <ThoughtCard
                        key={row.id}
                        row={row}
                        expanded={expandedIds.has(row.id)}
                        fading={transitioning.get(row.id) === "fading"}
                        flashing={flashIds.has(row.id)}
                        owned={isOwned(row)}
                        showFormatSticker={showFormatSticker}
                        showNameTags={showNameTags}
                        showingArchived={showingArchived}
                        highlightThoughtId={highlightThoughtId}
                        captureMode={captureMode}
                        formatMetaMap={formatMetaMap}
                        transitioning={transitioning}
                        armedTrashId={armedTrashId}
                        editingTagsId={editingTagsId}
                        newTagInput={newTagInput}
                        userTopics={userTopics}
                        onUpdate={handleThoughtUpdate}
                        onToggleExpand={toggleExpand}
                        onToggleArchive={toggleArchive}
                        onHandleTrashClick={handleTrashClick}
                        onSetArmedTrashId={setArmedTrashId}
                        onHandleVisibilityClick={handleVisibilityClick}
                        onSetEditingTagsId={setEditingTagsId}
                        onSetNewTagInput={setNewTagInput}
                        onToggleTopicOnThought={toggleTopicOnThought}
                        onCreateAndAssignTag={createAndAssignTag}
                        tagEditorRef={tagEditorRef}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Infinite scroll sentinel */}
        {nextCursor && !searchResults && !selectedDate && (
          <div ref={sentinelRef} className="flex justify-center py-4">
            {loadingMore && (
              <p className="text-xs animate-pulse" style={{ color: "var(--text-secondary)" }}>
                Loading more…
              </p>
            )}
          </div>
        )}

        <div className="flex justify-center pt-8 pb-4">
          <a
            href="/trash"
            className="inline-flex items-center gap-1.5 text-[10px] font-medium transition-opacity opacity-30 hover:opacity-60"
            style={{ color: "var(--text-muted)", textDecoration: "none" }}
            title="View trash"
          >
            <Trash2 size={12} />
            Trash
          </a>
        </div>

      </div>
    </div>
  );
}
