"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { getFormatMeta } from "../../lib/users";
import { useChat } from "../hooks/useChat";
import type { ApiMessage } from "../../lib/types";
import { ChatMessageBubble } from "./ChatMessages";
import { ExpandableThought } from "./ExpandableThought";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { useOptionPeriod } from "../hooks/useOptionPeriod";
import { useImageInput } from "../hooks/useImageInput";
import { useLatestRef } from "../hooks/useLatestRef";
import { useAudioAnalyser } from "../hooks/useAudioAnalyser";
import { useAppStore } from "../../lib/store";
import Waveform from "./Waveform";
import { Image, X, Mic, ArrowUp, Pause, RotateCcw } from "lucide-react";

export default function ChatView() {
  const userId = useAppStore((s) => s.userId)!;
  const theme = useAppStore((s) => s.theme);
  const captureMode = useAppStore((s) => s.captureMode);
  const lastNoteThought = useAppStore((s) => s.lastNoteThought);
  const setLastNoteThought = useAppStore((s) => s.setLastNoteThought);
  const draftKey = `draft-chat-${userId}`;
  const [input, setInput] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(draftKey) ?? "";
  });
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSendPending = useRef(false);

  const lastNoteThoughtRef = useLatestRef(lastNoteThought);

  const getContextPrefix = useCallback((): ApiMessage[] | undefined => {
    const note = lastNoteThoughtRef.current;
    if (!note) return undefined;
    const cd = note.data;
    const contextText = `[Context: A thought was just captured. ID: "${note.id}", Title: "${cd.title ?? ""}", Format: "${cd.format ?? ""}", Text: "${cd.raw_text ?? cd.text ?? ""}". The user may want to discuss, modify, or build on this.]`;
    setLastNoteThought(null);
    return [
      { role: "user", content: contextText },
      { role: "assistant", content: "Got it — I have context on what was just captured. How can I help?" },
    ];
  }, [setLastNoteThought]);

  const { messages, isStreaming, sendMessage, clearMessages } = useChat({
    source: "chat",
    captureMode,
    getContextPrefix,
    includeImages: true,
  });

  const handleTranscript = useCallback((text: string) => {
    setInput((prev) => {
      const separator = prev && !prev.endsWith(" ") ? " " : "";
      return prev + separator + text;
    });
  }, []);

  const { isListening, isPaused, isConnecting, isTranscribing, pendingAudio, supported: speechSupported, stream, startListening, stopListening, cancelListening, retryTranscription, discardPending } =
    useVoiceInput({ onTranscript: handleTranscript });
  const hasPendingAudio = pendingAudio !== null;

  const { amplitudes, currentAmplitude } = useAudioAnalyser(stream, isListening && !isPaused);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);
  useEffect(() => {
    if (isListening && !isPaused) {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (!isListening) {
      setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isListening, isPaused]);

  const formatMeta = getFormatMeta();

  // Focus input on mount — only on devices with a pointer (not phones)
  useEffect(() => {
    if (window.matchMedia("(hover: hover)").matches) {
      inputRef.current?.focus();
    }
  }, []);

  // Persist chat draft to localStorage
  useEffect(() => {
    if (input) {
      localStorage.setItem(draftKey, input);
    } else {
      localStorage.removeItem(draftKey);
    }
  }, [input, draftKey]);

  useOptionPeriod(
    useCallback(() => { if (speechSupported && !isStreaming) startListening(); }, [speechSupported, isStreaming, startListening]),
    useCallback(() => { if (isListening) stopListening(); }, [isListening, stopListening]),
  );

  const onImage = useCallback((dataUrl: string) => setPendingImage(dataUrl), []);
  const { isDragging, handleFileInput, handleDragOver, handleDragLeave, handleDrop, handlePaste } = useImageInput(onImage);

  // Clear chat when user switches
  const prevUserRef = useRef(userId);
  useEffect(() => {
    if (prevUserRef.current !== userId) {
      clearMessages();
      setInput("");
      setPendingImage(null);
      setLastNoteThought(null);
      prevUserRef.current = userId;
    }
  }, [userId, clearMessages, setLastNoteThought]);

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

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    const hasImage = !!pendingImage;
    if ((!trimmed && !hasImage) || isStreaming) return;

    sendMessage(trimmed, { imageDataUrl: pendingImage });
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setPendingImage(null);
  }, [input, isStreaming, pendingImage, sendMessage]);

  // Auto-send after transcript lands
  useEffect(() => {
    if (autoSendPending.current && input.trim() && !isTranscribing && !isStreaming) {
      autoSendPending.current = false;
      handleSend();
    }
  }, [input, isTranscribing, isStreaming, handleSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isDesktop = window.matchMedia("(hover: hover)").matches;
    if (e.key === "Enter" && !e.shiftKey && isDesktop) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className="relative z-10 flex flex-col h-full overflow-hidden"
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
            <span style={{ color: "var(--text-primary)" }}><span className="ignite-f">A</span>sk </span>
            <span className="shimmer-text" style={{ backgroundImage: theme.shimmerBg }}>away.</span>
          </h1>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 pb-4"
        style={{ scrollBehavior: "smooth", overscrollBehavior: "contain" }}
      >
        <div className="max-w-[640px] mx-auto flex flex-col gap-4">
          {messages.length === 0 && lastNoteThought && (
            <div className="flex flex-col items-center py-8 gap-2 animate-fade-up">
              <div className="w-full max-w-sm">
                <div
                  className="text-[10px] font-bold tracking-[0.15em] uppercase mb-2 px-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Just saved
                </div>
                <ExpandableThought data={{ ...lastNoteThought.data, saved: true }} formatMeta={formatMeta} />
              </div>
              <p className="text-[11px] mt-2 text-center" style={{ color: "var(--text-muted)" }}>
                Continue the conversation, or start fresh.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessageBubble key={msg.id} msg={msg} formatMeta={formatMeta} isStreaming={isStreaming} />
          ))}
        </div>
      </div>

      {/* Input area */}
      <div
        className="shrink-0 px-4 sm:px-6 pt-3"
        style={!speechSupported ? { paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" } : undefined}
      >
        <div className="max-w-[640px] mx-auto">
          {/* Image preview */}
          {pendingImage && (
            <div className="relative inline-block mb-2">
              <img
                src={pendingImage}
                alt="Preview"
                className="rounded-lg max-h-24 object-contain"
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

          <div className="relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                const el = e.target;
                el.style.transition = "none";
                el.style.height = "0px";
                el.offsetHeight; // force reflow
                const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
                const padding = parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom);
                const minH = lineHeight * 2 + padding;
                const maxH = lineHeight * 9 + padding;
                const clamped = Math.max(minH, Math.min(maxH, el.scrollHeight));
                el.style.height = `${clamped}px`;
                el.style.overflow = el.scrollHeight > maxH ? "auto" : "hidden";
                el.style.transition = "";
              }}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder="Talk to your thoughts…"
              rows={2}
              maxLength={2000}
              onPaste={handlePaste}
              className="thought-input w-full resize-none rounded-xl pl-4 pr-[6rem] py-3 text-sm leading-relaxed outline-none transition-all duration-200 disabled:opacity-40"
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-bright)",
                color: "var(--text-primary)",
                fontFamily: "inherit",
                overflow: "hidden",
              }}
            />
            {/* Image button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
              className="absolute right-14 top-1/2 -translate-y-1/2 rounded-lg p-2 transition-all duration-150 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
              style={{ background: "var(--accent-dim)" }}
              aria-label="Attach image"
              title="Attach image"
            >
              <Image size={16} color="var(--accent)" />
            </button>

            <button
              onClick={handleSend}
              disabled={(!input.trim() && !pendingImage) || isStreaming}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 transition-all duration-150 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
              style={{ background: "var(--accent-dim)" }}
              aria-label="Send"
            >
              <ArrowUp size={16} color="var(--accent)" strokeWidth={2.5} />
            </button>
          </div>
          <div className="flex items-center justify-end mt-2 px-1">
            <div className="flex items-center gap-2">
              <span className="desktop-hint text-[11px]" style={{ color: "var(--text-muted)" }}>
                ↵ send · ⇧↵ newline · ⌥. voice
              </span>
              {input.length > 0 && (
                <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {input.length} / 20000
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Talk button */}
      {speechSupported && (
        <div
          className="shrink-0 flex flex-col items-center gap-1.5 py-3"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="flex items-center gap-4">
            {/* Cancel / Discard button */}
            <button
              onClick={() => { hasPendingAudio && !isListening ? discardPending() : cancelListening(); }}
              className={`rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer ${
                isListening || (hasPendingAudio && !isTranscribing) ? "opacity-100 scale-100" : "opacity-20 scale-90"
              }`}
              disabled={!isListening && !(hasPendingAudio && !isTranscribing)}
              style={{
                width: "64px",
                height: "64px",
                background: "var(--accent-dim)",
                border: `2px solid var(--text-muted)`,
              }}
              aria-label={hasPendingAudio && !isListening ? "Discard recording" : "Cancel recording"}
            >
              <X size={24} color="var(--text-muted)" />
            </button>

            {/* Main mic button */}
            <button
              onClick={() => {
                if (hasPendingAudio && !isListening && !isTranscribing) retryTranscription();
                else if (isListening) { autoSendPending.current = true; stopListening(); }
                else if (!isStreaming && !isTranscribing && !isConnecting) startListening();
              }}
              disabled={isStreaming || isTranscribing}
              className={`talk-button rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${isListening ? "talk-button-recording" : isConnecting ? "talk-button-connecting" : ""}`}
              style={{
                width: "96px",
                height: "96px",
                background: isListening ? undefined : "var(--accent-dim)",
                border: isListening ? undefined : "2px solid var(--accent)",
                "--shimmer-bg": theme.shimmerBg,
              } as React.CSSProperties}
              aria-label={isTranscribing ? "Transcribing…" : hasPendingAudio ? "Tap to retry" : isListening ? "Tap to send" : isConnecting ? "Connecting…" : "Tap to talk"}
            >
              {isTranscribing ? (
                <span
                  className="dot-pulse inline-block w-3 h-3 rounded-full"
                  style={{ background: "var(--accent)" }}
                />
              ) : hasPendingAudio && !isListening ? (
                <RotateCcw size={36} color="var(--accent)" />
              ) : (
                <Mic size={36} color="var(--accent)" fill={(isListening || isConnecting) ? "var(--accent-dim)" : "none"} style={{ transition: "fill 0.4s ease, stroke 0.4s ease" }} />
              )}
            </button>

            {/* Pause — stop and land in input for review */}
            <button
              onClick={stopListening}
              className={`rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer ${isListening ? "opacity-100 scale-100" : "opacity-20 scale-90"}`}
              disabled={!isListening}
              style={{
                width: "64px",
                height: "64px",
                background: "var(--accent-dim)",
                border: "2px solid var(--accent)",
              }}
              aria-label="Stop and review"
            >
              <Pause size={24} color="var(--accent)" />
            </button>
          </div>
          {/* Fixed-height area for waveform + status so buttons don't shift */}
          <div style={{ minHeight: "120px" }}>
            <Waveform amplitudes={amplitudes} isRecording={isListening} isPaused={isPaused} elapsed={elapsed} />
            {(isTranscribing || (hasPendingAudio && !isListening)) && (
              <p className={`mt-2 text-center ${isTranscribing ? "text-xs" : "text-sm"}`} style={{ color: "var(--text-muted)" }}>
                {isTranscribing
                  ? "Audio saved · Transcribing…"
                  : "Recording saved, but capture failed. Tap to retry."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
