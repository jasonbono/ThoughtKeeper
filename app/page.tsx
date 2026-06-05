"use client";

import { lazy, Suspense, useEffect, useRef } from "react";
import SpatialNav, { NAV_ORDER } from "./components/SpatialNav";
import ErrorBoundary from "./components/ErrorBoundary";
import { DEFAULT_USER, applyColorTheme } from "../lib/users";
import { useAppStore } from "../lib/store";

const SettingsView = lazy(() => import("./components/SettingsView"));
const VoiceView = lazy(() => import("./components/VoiceView"));
const PulseView = lazy(() => import("./components/PulseView"));
const ChatView = lazy(() => import("./components/ChatView"));
const TemplatesView = lazy(() => import("./components/TemplatesView"));
const ReviewView = lazy(() => import("./components/ReviewView"));

export default function Home() {
  const screen = useAppStore(s => s.screen);
  const userId = useAppStore(s => s.userId);
  const theme = useAppStore(s => s.theme);
  const captureMode = useAppStore(s => s.captureMode);

  const navigateTo = useAppStore(s => s.navigateTo);
  const setUserId = useAppStore(s => s.setUserId);
  const setTheme = useAppStore(s => s.setTheme);
  const setCaptureMode = useAppStore(s => s.setCaptureMode);
  const setHighlightThoughtId = useAppStore(s => s.setHighlightThoughtId);
  const setTimezone = useAppStore(s => s.setTimezone);

  const syncFromPath = useAppStore(s => s.syncFromPath);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Initialize screen from URL pathname on mount
  useEffect(() => {
    syncFromPath(window.location.pathname);
  }, []);

  // Sync screen on browser back/forward
  useEffect(() => {
    const onPopState = () => syncFromPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [syncFromPath]);

  // Fetch authenticated user
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.userId) {
          setUserId(data.userId);
          if (data.timezone) setTimezone(data.timezone);
          setTheme(applyColorTheme());
        }
      })
      .catch(() => {
        setUserId(DEFAULT_USER);
        setTheme(applyColorTheme());
      });
  }, []);

  // Restore captureMode and timezone from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("captureMode");
    if (stored === "shared" || stored === "private") setCaptureMode(stored);
    const storedTz = localStorage.getItem("timezone");
    if (storedTz) setTimezone(storedTz);
  }, []);

  // Re-apply color theme when light/dark changes
  useEffect(() => {
    if (!userId) return;
    setTheme(applyColorTheme());

    const observer = new MutationObserver(() => {
      setTheme(applyColorTheme());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [userId]);

  // Swipe gesture handling — adjacency derived from NAV_ORDER
  function handleTouchStart(e: React.TouchEvent) {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < 60 && absDy < 60) return;

    if (absDx > absDy * 1.5) {
      const idx = NAV_ORDER.indexOf(screen);
      if (dx < 0 && idx < NAV_ORDER.length - 1) {
        navigateTo(NAV_ORDER[idx + 1]);
      } else if (dx > 0 && idx > 0) {
        navigateTo(NAV_ORDER[idx - 1]);
      }
    }
  }

  // Clear highlight after leaving captures
  useEffect(() => {
    if (screen !== "captures") {
      const t = setTimeout(() => setHighlightThoughtId(null), 500);
      return () => clearTimeout(t);
    }
  }, [screen]);

  // Calculate transform based on current screen's position in NAV_ORDER
  const col = NAV_ORDER.indexOf(screen);
  const transform = `translateX(${-col * 100}vw)`;

  // Don't render until we know who's logged in
  if (!userId) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ width: "100vw", height: "100dvh", background: "var(--bg)" }}
      >
        <span className="text-sm animate-pulse" style={{ color: "var(--text-muted)" }}>
          Loading…
        </span>
      </div>
    );
  }

  return (
    <div className="relative overflow-clip" style={{ width: "100vw", height: "100dvh" }}>
      {/* Private mode indicator — top edge glow */}
      <div
        className="absolute top-0 left-0 right-0 z-50 pointer-events-none transition-all duration-500"
        style={(() => {
          const isPlain = theme.vars["--accent"] === "#a0a0aa" || theme.vars["--accent"] === "#6b7280";
          const barColor = isPlain ? "#f59e0b" : (theme.vars["--accent"] || "#f59e0b");
          const glowColor = isPlain ? "rgba(245,158,11,0.2)" : (theme.vars["--accent-dim"] || "rgba(245,158,11,0.2)");
          return {
            height: captureMode === "private" ? "3px" : "0px",
            background: `linear-gradient(90deg, transparent 0%, ${barColor} 30%, ${barColor} 70%, transparent 100%)`,
            opacity: captureMode === "private" ? 0.45 : 0,
            boxShadow: captureMode === "private" ? `0 0 12px 2px ${glowColor}` : "none",
          };
        })()}
      />
      <div className={`hero-glow${theme.glowStyle ? " hero-glow-image" : ""}`} aria-hidden="true" style={{ background: theme.glowBg, ...theme.glowStyle }} />

      {/* Global nav bar — absolutely positioned, outside the grid */}
      <div className="absolute z-40 nav-position">
        <SpatialNav />
      </div>

      {/* Spatial grid container — N columns × 1 row, flat */}
      <div
        className="transition-transform duration-500 ease-in-out"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${NAV_ORDER.length}, 100vw)`,
          gridTemplateRows: "100dvh",
          transform,
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* settings */}
        <div style={{ width: "100vw", height: "100dvh" }}>
          <ErrorBoundary name="Settings">
            <Suspense><SettingsView /></Suspense>
          </ErrorBoundary>
        </div>

        {/* voice */}
        <div style={{ width: "100vw", height: "100dvh" }}>
          <ErrorBoundary name="Voice">
            <Suspense><VoiceView /></Suspense>
          </ErrorBoundary>
        </div>

        {/* pulse */}
        <div style={{ width: "100vw", height: "100dvh" }}>
          <ErrorBoundary name="Pulse">
            <Suspense><PulseView /></Suspense>
          </ErrorBoundary>
        </div>

        {/* chat */}
        <div style={{ width: "100vw", height: "100dvh" }}>
          <ErrorBoundary name="Chat">
            <Suspense><ChatView /></Suspense>
          </ErrorBoundary>
        </div>

        {/* templates */}
        <div style={{ width: "100vw", height: "100dvh" }}>
          <ErrorBoundary name="Templates">
            <Suspense><TemplatesView /></Suspense>
          </ErrorBoundary>
        </div>

        {/* captures */}
        <div className="overflow-y-auto" style={{ width: "100vw", height: "100dvh" }}>
          <ErrorBoundary name="Review">
            <Suspense><ReviewView /></Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
