"use client";

import { useState, useEffect } from "react";
import { Sun, Moon, Archive, Trash2, Lock, Users } from "lucide-react";
import {
  type ColorTheme,
  ADMIN_USER,
  USERS,
  COLOR_THEME_IDS,
  COLOR_THEME_LABELS,
  DEFAULT_COLOR_THEME,
  applyColorTheme,
} from "../../lib/users";
import { formatDateShort } from "../../lib/format";
import { useAppStore } from "../../lib/store";

const TZ_OPTIONS = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
];

interface FeatureRequest {
  id: string;
  user_id: string;
  text: string;
  title: string;
  created_at: string;
  archived?: number;
}

export default function SettingsView() {
  const userId = useAppStore(s => s.userId)!;
  const setThemeInStore = useAppStore(s => s.setTheme);
  const captureMode = useAppStore(s => s.captureMode);
  const setCaptureMode = useAppStore(s => s.setCaptureMode);
  const timezone = useAppStore(s => s.timezone);
  const setTimezone = useAppStore(s => s.setTimezone);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [colorTheme, setColorTheme] = useState<ColorTheme>(DEFAULT_COLOR_THEME);
  const [mounted, setMounted] = useState(false);

  // Feature requests
  const [frTitle, setFrTitle] = useState("");
  const [frText, setFrText] = useState("");
  const [frSubmitting, setFrSubmitting] = useState(false);
  const [frSuccess, setFrSuccess] = useState(false);
  const [featureRequests, setFeatureRequests] = useState<FeatureRequest[]>([]);
  const [archivedRequests, setArchivedRequests] = useState<FeatureRequest[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [showActive, setShowActive] = useState(true);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  useEffect(() => {
    setMounted(true);
    const current = document.documentElement.getAttribute("data-theme") as "dark" | "light";
    setTheme(current || "dark");
    const savedColor = localStorage.getItem("colorTheme") as ColorTheme | null;
    if (savedColor && COLOR_THEME_IDS.includes(savedColor)) {
      setColorTheme(savedColor);
    }

    // Load feature requests (admin list is gated server-side)
    fetch("/api/feature-requests")
      .then((r) => r.json())
      .then((data) => setFeatureRequests(data.requests ?? []))
      .catch(() => {});
    fetch("/api/feature-requests?archived=true")
      .then((r) => r.json())
      .then((data) => {
        const all = data.requests ?? [];
        setArchivedRequests(all.filter((r: FeatureRequest) => r.archived));
      })
      .catch(() => {});
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  async function submitFeatureRequest() {
    if (!frTitle.trim() || !frText.trim() || frSubmitting) return;
    setFrSubmitting(true);
    try {
      const res = await fetch("/api/feature-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: frTitle.trim(), text: frText.trim() }),
      });
      if (res.ok) {
        setFrTitle("");
        setFrText("");
        setFrSuccess(true);
        setTimeout(() => setFrSuccess(false), 3000);
        // Refresh lists
        const [activeData, allData] = await Promise.all([
          fetch("/api/feature-requests").then((r) => r.json()),
          fetch("/api/feature-requests?archived=true").then((r) => r.json()),
        ]);
        setFeatureRequests(activeData.requests ?? []);
        setArchivedRequests((allData.requests ?? []).filter((r: FeatureRequest) => r.archived));
      }
    } catch {
      // ignore
    } finally {
      setFrSubmitting(false);
    }
  }

  async function archiveRequest(id: string) {
    setFeatureRequests((prev) => prev.filter((r) => r.id !== id));
    try {
      const res = await fetch("/api/feature-requests", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        await refreshRequests();
      }
    } catch {
      refreshRequests();
    }
  }

  async function trashRequest(id: string) {
    setFeatureRequests((prev) => prev.filter((r) => r.id !== id));
    setArchivedRequests((prev) => prev.filter((r) => r.id !== id));
    try {
      await fetch("/api/feature-requests", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, permanent: true }),
      });
      await refreshRequests();
    } catch {
      refreshRequests();
    }
  }

  async function refreshRequests() {
    const [activeData, allData] = await Promise.all([
      fetch("/api/feature-requests").then((r) => r.json()),
      fetch("/api/feature-requests?archived=true").then((r) => r.json()),
    ]);
    setFeatureRequests(activeData.requests ?? []);
    setArchivedRequests((allData.requests ?? []).filter((r: FeatureRequest) => r.archived));
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ width: "100vw", height: "100dvh" }}
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
            <span className="ignite-f">S</span>ettings.
          </h1>
        </div>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-md mx-auto flex flex-col gap-6">
          {/* Profile */}
          <section>
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: "var(--text-muted)" }}
            >
              Profile
            </h2>
            <div
              className="rounded-xl p-4 flex items-center gap-3"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
                style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
              >
                {USERS[userId].displayName[0]}
              </div>
              <div>
                <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
                  {USERS[userId].displayName}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {USERS[userId].email}
                </div>
              </div>
            </div>
          </section>

          {/* Capture Mode */}
          <section>
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: "var(--text-muted)" }}
            >
              Capture Mode
            </h2>
            <div
              className="rounded-xl p-4 flex items-center justify-between"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div>
                <div className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
                  {captureMode === "private" ? "Private" : "Shared"}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {captureMode === "private" ? "Only you can see new thoughts" : "New thoughts visible to your team"}
                </div>
              </div>
              <div
                className="flex items-center rounded-full p-0.5"
                style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-bright)" }}
              >
                <button
                  onClick={() => setCaptureMode("private")}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full transition-all duration-200 cursor-pointer"
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    background: captureMode === "private" ? "var(--surface-hover)" : "transparent",
                    color: captureMode === "private" ? "var(--text-primary)" : "var(--text-muted)",
                  }}
                >
                  <Lock size={10} />
                  Private
                </button>
                <button
                  onClick={() => setCaptureMode("shared")}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full transition-all duration-200 cursor-pointer"
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    background: captureMode === "shared" ? "var(--surface-hover)" : "transparent",
                    color: captureMode === "shared" ? "var(--text-primary)" : "var(--text-muted)",
                  }}
                >
                  <Users size={10} />
                  Shared
                </button>
              </div>
            </div>
          </section>

          {/* Appearance */}
          {mounted && (
            <section>
              <h2
                className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: "var(--text-muted)" }}
              >
                Appearance
              </h2>
              {/* Dark / Light mode */}
              <div
                className="rounded-xl p-4 flex items-center justify-between"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <div>
                  <div className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
                    Mode
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {theme === "dark" ? "Dark" : "Light"}
                  </div>
                </div>
                <button
                  onClick={toggleTheme}
                  className="p-2.5 rounded-lg transition-all duration-200 cursor-pointer hover:opacity-80"
                  style={{
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--border-bright)",
                    color: "var(--text-primary)",
                  }}
                  aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                >
                  {theme === "dark" ? (
                    <Sun size={18} />
                  ) : (
                    <Moon size={18} />
                  )}
                </button>
              </div>

              {/* Color theme */}
              <div
                className="rounded-xl p-4 flex items-center justify-between mt-2"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <div>
                  <div className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
                    Accent
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {COLOR_THEME_LABELS[colorTheme]}
                  </div>
                </div>
                <div className="flex gap-2">
                  {COLOR_THEME_IDS.map((ct) => (
                    <button
                      key={ct}
                      onClick={() => {
                        setColorTheme(ct);
                        localStorage.setItem("colorTheme", ct);
                        setThemeInStore(applyColorTheme(ct));
                      }}
                      className="w-8 h-8 rounded-full transition-all duration-200 cursor-pointer"
                      style={{
                        background: { pink: "#f472b6", mint: "#50dca5", plain: "#a0a0aa", sunset: "linear-gradient(135deg, #f97316, #ec4899, #8b5cf6)", sky: "linear-gradient(135deg, #7c3aed, #ec4899, #a855f7)", clouds: "linear-gradient(135deg, #38bdf8, #fbbf24, #7dd3fc)" }[ct] || "#a0a0aa",
                        border: colorTheme === ct ? "2.5px solid var(--text-primary)" : "2.5px solid transparent",
                        opacity: colorTheme === ct ? 1 : 0.45,
                      }}
                      aria-label={`${COLOR_THEME_LABELS[ct]} accent`}
                    />
                  ))}
                </div>
              </div>

              {/* Timezone */}
              <div
                className="rounded-xl p-4 flex items-center justify-between mt-2"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <div>
                  <div className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
                    Timezone
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {timezone.replace(/_/g, " ").replace(/\//g, " / ")}
                  </div>
                </div>
                <select
                  value={timezone}
                  onChange={(e) => {
                    setTimezone(e.target.value);
                    localStorage.setItem("timezone", e.target.value);
                  }}
                  className="text-xs rounded-lg px-2 py-1.5 cursor-pointer"
                  style={{
                    background: "var(--surface-hover)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {TZ_OPTIONS.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
            </section>
          )}

          {/* How ThoughtKeeper Works */}
          <section>
            <button
              onClick={() => setShowHowItWorks(!showHowItWorks)}
              className="text-xs font-semibold uppercase tracking-wider mb-3 cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1"
              style={{ color: "var(--text-muted)" }}
            >
              How ThoughtKeeper Works {showHowItWorks ? "▾" : "▸"}
            </button>
            {showHowItWorks && (
              <div
                className="rounded-xl p-4 flex flex-col gap-4 text-sm leading-relaxed"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
              >
                <div>
                  <div className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>What is ThoughtKeeper?</div>
                  <p>ThoughtKeeper is your second brain — a place to quickly capture thoughts and to-dos. ThoughtKeeper (the AI) classifies and organizes everything so you can focus on thinking, not filing.</p>
                </div>
                <div>
                  <div className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Two ways to capture</div>
                  <ul className="list-disc pl-4 flex flex-col gap-1">
                    <li><strong>Voice</strong> — Tap the mic, speak your thought, and it's saved and classified automatically. Tap the pen icon to write instead.</li>
                    <li><strong>Chat</strong> — Talk to ThoughtKeeper. Develop ideas through conversation, search your thoughts, or ask it to save something.</li>
                  </ul>
                </div>
                <div>
                  <div className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Formats</div>
                  <p>Every thought is classified into one of two formats: <strong>To-do</strong> or <strong>Capture</strong>. ThoughtKeeper picks the format automatically, but you can always change it.</p>
                </div>
                <div>
                  <div className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Topics</div>
                  <p>Topics are tags you create to organize thoughts across formats. Add them above, and ThoughtKeeper will suggest them when saving.</p>
                </div>
                <div>
                  <div className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Sharing</div>
                  <p>Toggle between <strong>private</strong> and <strong>shared</strong> mode. Shared thoughts are visible to your teammate.</p>
                </div>
              </div>
            )}
          </section>

          {/* Feature Request */}
          <section>
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: "var(--text-muted)" }}
            >
              Feature Request
            </h2>
            <div
              className="rounded-xl p-4 flex flex-col gap-3"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <input
                type="text"
                value={frTitle}
                onChange={(e) => setFrTitle(e.target.value)}
                placeholder="Short title…"
                maxLength={100}
                className="text-sm rounded-lg px-3 py-2 outline-none"
                style={{
                  background: "var(--bg-subtle)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-bright)",
                }}
              />
              <textarea
                value={frText}
                onChange={(e) => setFrText(e.target.value)}
                placeholder="Describe what you'd like…"
                rows={3}
                className="text-sm rounded-lg px-3 py-2 outline-none resize-none"
                style={{
                  background: "var(--bg-subtle)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-bright)",
                }}
              />
              <button
                onClick={submitFeatureRequest}
                disabled={!frTitle.trim() || !frText.trim() || frSubmitting}
                className="self-end px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all disabled:opacity-40"
                style={{ background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--accent-dim)" }}
              >
                {frSubmitting ? "Submitting…" : "Submit"}
              </button>
              {frSuccess && (
                <span className="text-xs font-medium" style={{ color: "#22c55e" }}>
                  Submitted!
                </span>
              )}
            </div>
          </section>

          {/* Feature Request List (admin only) */}
          {userId === ADMIN_USER && featureRequests.length > 0 && (
            <section>
              <button
                onClick={() => setShowActive(!showActive)}
                className="text-xs font-semibold uppercase tracking-wider mb-3 cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1"
                style={{ color: "var(--text-muted)" }}
              >
                Active Requests ({featureRequests.length}) {showActive ? "▾" : "▸"}
              </button>
              {showActive && <div className="flex flex-col gap-2">
                {featureRequests.map((fr) => (
                  <div
                    key={fr.id}
                    className="rounded-xl p-3 flex flex-col gap-1"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {fr.title}
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {fr.user_id} · {formatDateShort(fr.created_at, timezone)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs flex-1" style={{ color: "var(--text-secondary)" }}>
                        {fr.text}
                      </p>
                      <div className="flex shrink-0 ml-2 gap-1">
                        <button
                          onClick={() => archiveRequest(fr.id)}
                          className="p-1.5 rounded-lg cursor-pointer hover:opacity-70 transition-opacity"
                          style={{ color: "var(--text-muted)" }}
                          aria-label="Archive request"
                          title="Archive"
                        >
                          <Archive size={14} />
                        </button>
                        <button
                          onClick={() => trashRequest(fr.id)}
                          className="p-1.5 rounded-lg cursor-pointer hover:opacity-70 transition-opacity"
                          style={{ color: "var(--text-muted)" }}
                          aria-label="Delete request"
                          title="Delete permanently"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>}
            </section>
          )}

          {/* Archived Feature Requests (admin only) */}
          {userId === ADMIN_USER && archivedRequests.length > 0 && (
            <section>
              <button
                onClick={() => setShowArchived(!showArchived)}
                className="text-xs font-semibold uppercase tracking-wider mb-3 cursor-pointer hover:opacity-80 transition-opacity"
                style={{ color: "var(--text-muted)" }}
              >
                Addressed ({archivedRequests.length}) {showArchived ? "▾" : "▸"}
              </button>
              {showArchived && (
                <div className="flex flex-col gap-2">
                  {archivedRequests.map((fr) => (
                    <div
                      key={fr.id}
                      className="rounded-xl p-3 flex flex-col gap-1"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", opacity: 0.6 }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                          {fr.title}
                        </span>
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {fr.user_id} · {formatDateShort(fr.created_at, timezone)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs flex-1" style={{ color: "var(--text-secondary)" }}>
                          {fr.text}
                        </p>
                        <button
                          onClick={() => trashRequest(fr.id)}
                          className="ml-2 p-1.5 rounded-lg cursor-pointer hover:opacity-70 transition-opacity shrink-0"
                          style={{ color: "var(--text-muted)" }}
                          aria-label="Delete request"
                          title="Delete permanently"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
