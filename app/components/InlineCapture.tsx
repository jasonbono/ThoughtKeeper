"use client";

import { useState, useRef, useCallback, useEffect, type MutableRefObject } from "react";
import { useAppStore } from "../../lib/store";
import { ExpandableThought } from "./ExpandableThought";
import { getFormatMeta } from "../../lib/users";
import { useImageInput } from "../hooks/useImageInput";
import type { ThoughtResult } from "../../lib/types";
import { PenLine, Image, ArrowUp, X } from "lucide-react";

const DRAFT_KEY = "draft-inline-capture";

interface InlineCaptureProps {
  open: boolean;
  onClose: () => void;
  /** Ref that VoiceView populates to append voice transcript text into the textarea. */
  appendTextRef: MutableRefObject<(text: string) => void>;
  /** Ref that VoiceView populates to trigger note submission (for voice auto-submit). */
  submitNoteRef: MutableRefObject<() => void>;
}

export default function InlineCapture({ open, onClose, appendTextRef, submitNoteRef }: InlineCaptureProps) {
  const captureMode = useAppStore((s) => s.captureMode);
  const setLastNoteThought = useAppStore((s) => s.setLastNoteThought);

  const [text, setText] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(DRAFT_KEY) ?? "";
  });
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phase, setPhase] = useState<"editing" | "fading-out" | "showing-card">("editing");
  const [lastThought, setLastThought] = useState<ThoughtResult | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatMeta = getFormatMeta();

  // ── Expose append-text and submit to parent (VoiceView) via refs ──
  useEffect(() => {
    appendTextRef.current = (t: string) => {
      setText((prev) => {
        const sep = prev && !prev.endsWith(" ") ? " " : "";
        return prev + sep + t;
      });
    };
    return () => { appendTextRef.current = () => {}; };
  }, [appendTextRef]);

  // submitNote changes on every render (useCallback deps), so track it with a ref
  const submitNoteLatestRef = useRef<() => void>(() => {});

  // Persist draft to localStorage
  useEffect(() => {
    if (text) {
      localStorage.setItem(DRAFT_KEY, text);
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [text]);

  // Focus textarea when opening
  useEffect(() => {
    if (open && phase === "editing") {
      setTimeout(() => {
        if (window.matchMedia("(hover: hover)").matches) {
          textareaRef.current?.focus();
        }
      }, 100);
    }
  }, [open, phase]);

  // Auto-grow textarea
  const autoGrow = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }, []);

  useEffect(() => {
    autoGrow();
  }, [text, autoGrow]);

  const onImage = useCallback((dataUrl: string) => setPendingImage(dataUrl), []);
  const { isDragging, handleFileInput, handleDragOver, handleDragLeave, handleDrop, handlePaste } = useImageInput(onImage);

  // Close and clear draft
  const handleClose = useCallback(() => {
    setText("");
    setPendingImage(null);
    localStorage.removeItem(DRAFT_KEY);
    onClose();
  }, [onClose]);

  const submitNote = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    setPhase("fading-out");

    const fadePromise = new Promise((r) => setTimeout(r, 1000));

    const captureBody: Record<string, string> = { text: trimmed, mode: captureMode ?? "private" };
    if (pendingImage) captureBody.image_data = pendingImage;

    const apiPromise = fetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(captureBody),
    }).then(async (res) => {
      if (!res.ok) throw new Error("Failed to save capture");
      return res.json();
    });

    try {
      const [, result] = await Promise.all([fadePromise, apiPromise]);

      const thoughtData = (result.thought as Record<string, unknown>) ?? result;
      const thought: ThoughtResult = {
        id: thoughtData.id as string,
        data: { ...thoughtData, saved: true },
        isUpdate: false,
      };
      setLastThought(thought);
      setLastNoteThought({ id: thought.id, data: thought.data });
      setText("");
      setPendingImage(null);
      localStorage.removeItem(DRAFT_KEY);
      setPhase("showing-card");

      setTimeout(() => {
        setPhase("editing");
        setTimeout(() => textareaRef.current?.focus(), 50);
      }, 2500);
    } catch (err) {
      console.error("Inline capture error:", err);
      setPhase("editing");
    } finally {
      setIsSubmitting(false);
    }
  }, [text, isSubmitting, pendingImage, captureMode, setLastNoteThought]);

  // Keep submitNoteRef in sync so VoiceView can call the latest version
  submitNoteLatestRef.current = submitNote;
  useEffect(() => {
    submitNoteRef.current = () => submitNoteLatestRef.current();
    return () => { submitNoteRef.current = () => {}; };
  }, [submitNoteRef]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submitNote();
    }
    if (e.key === "Escape" && !text.trim() && !pendingImage) {
      handleClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="w-full pt-[10vh]"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="rounded-2xl px-8 py-6 text-center"
            style={{ background: "var(--surface)", border: "2px dashed var(--accent)" }}
          >
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Drop image here
            </p>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInput}
        className="hidden"
      />

      <div className="max-w-[640px] mx-auto px-6">
        {/* Editor — always mounted, animated via opacity */}
        <div
          style={{
            opacity: phase === "editing" ? 1 : 0,
            transform: phase === "editing" ? "translateY(0)" : "translateY(-20px)",
            transition: "opacity 0.9s ease, transform 0.9s ease",
            pointerEvents: phase === "editing" ? "auto" : "none",
            position: phase === "showing-card" ? "absolute" : "relative",
            visibility: phase === "showing-card" ? "hidden" : "visible",
          }}
        >
          {/* Note card container */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "var(--bg-subtle)",
              border: "1px solid var(--border-bright)",
            }}
          >
            {/* Image preview */}
            {pendingImage && (
              <div className="relative inline-block m-4 mb-0">
                <img
                  src={pendingImage}
                  alt="Preview"
                  className="rounded-lg max-h-32 object-contain"
                  style={{ border: "1px solid var(--border-bright)" }}
                />
                <button
                  onClick={() => setPendingImage(null)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs cursor-pointer"
                  style={{ background: "var(--text-muted)", color: "var(--bg-subtle)" }}
                  aria-label="Remove image"
                >
                  x
                </button>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              disabled={isSubmitting}
              placeholder="Thought, to-do, idea, anything…"
              maxLength={20000}
              className="notes-editor"
              style={{
                color: "var(--text-primary)",
                caretColor: "var(--accent)",
                padding: "1.25rem 1.25rem 0.75rem",
              }}
            />

            {/* Toolbar — inside the card */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting}
                  className="rounded-lg p-2 transition-all duration-150 disabled:opacity-20 cursor-pointer"
                  style={{ background: "var(--accent-dim)" }}
                  aria-label="Attach image"
                  title="Attach image"
                >
                  <Image size={16} color="var(--accent)" />
                </button>
                <button
                  onClick={handleClose}
                  className="rounded-lg p-2 cursor-pointer transition-all duration-150"
                  style={{ background: "var(--accent-dim)" }}
                  aria-label="Back to voice"
                  title="Back to voice"
                >
                  <X size={16} color="var(--text-muted)" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                {text.length > 0 && (
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {text.length} / 20000
                  </span>
                )}
                <button
                  onClick={submitNote}
                  disabled={!text.trim() || isSubmitting}
                  className="inline-flex items-center justify-center rounded-lg p-2 cursor-pointer transition-all duration-150 disabled:opacity-20 disabled:cursor-not-allowed"
                  style={{ background: "var(--accent-dim)" }}
                  aria-label="Capture"
                >
                  <ArrowUp size={16} color="var(--accent)" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </div>
          <div className="mt-2 px-1">
            <span className="desktop-hint text-[11px]" style={{ color: "var(--text-muted)" }}>
              ⌘↵ capture · ⌥. voice · esc back · drop/paste image
            </span>
          </div>
        </div>

        {/* "Classifying" spinner */}
        <div
          className="flex flex-col items-center justify-center py-16"
          style={{
            opacity: phase === "fading-out" ? 1 : 0,
            transition: "opacity 0.5s ease",
            pointerEvents: "none",
            position: phase === "fading-out" ? "relative" : "absolute",
            visibility: phase === "fading-out" ? "visible" : "hidden",
          }}
        >
          <span
            className="dot-pulse inline-block w-2 h-2 rounded-full mb-3"
            style={{ background: "var(--accent)" }}
          />
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            Classifying your thought…
          </span>
        </div>

        {/* Result card */}
        {lastThought && (
          <div
            className="mt-8"
            style={{
              opacity: phase === "showing-card" ? 1 : 0,
              transform: phase === "showing-card" ? "translateY(0)" : "translateY(20px)",
              transition: "opacity 0.6s ease, transform 0.6s ease",
              pointerEvents: phase === "showing-card" ? "auto" : "none",
              position: phase === "showing-card" ? "relative" : "absolute",
              visibility: phase === "showing-card" ? "visible" : "hidden",
            }}
          >
            <ExpandableThought data={lastThought.data} formatMeta={formatMeta} />
          </div>
        )}

        {/* Previous thought */}
        {phase === "editing" && lastThought && (
          <div className="mt-8 opacity-60">
            <div
              className="text-[10px] font-bold tracking-[0.15em] uppercase mb-2 px-1"
              style={{ color: "var(--text-muted)" }}
            >
              Previous thought
            </div>
            <ExpandableThought data={lastThought.data} formatMeta={formatMeta} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Small toggle button — rendered by parent when InlineCapture is closed. */
export function InlineCaptureButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl p-2 cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95"
      style={{
        background: "var(--accent-dim)",
        border: "1px solid var(--border-bright)",
      }}
      aria-label="Write a thought"
      title="Write a thought"
    >
      <PenLine size={18} color="var(--accent)" />
    </button>
  );
}
