"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { getFormatMeta } from "../../lib/users";
import { useAppStore } from "../../lib/store";
import { ExpandableThought } from "./ExpandableThought";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { useAudioAnalyser } from "../hooks/useAudioAnalyser";
import { useLatestRef } from "../hooks/useLatestRef";
import { useOptionPeriod } from "../hooks/useOptionPeriod";
import Waveform from "./Waveform";
import { X, Mic, Pause, Play, RotateCcw } from "lucide-react";
import InlineCapture, { InlineCaptureButton } from "./InlineCapture";

export default function VoiceView() {
  const theme = useAppStore(s => s.theme);
  const captureMode = useAppStore(s => s.captureMode);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastThought, setLastThought] = useState<Record<string, unknown> | null>(null);
  const [writeMode, setWriteMode] = useState(false);

  const formatMeta = getFormatMeta();

  // ── Refs for connecting voice hooks to InlineCapture ──
  const writeModeRef = useLatestRef(writeMode);
  const editorAppendRef = useRef<(text: string) => void>(() => {});
  const editorSubmitRef = useRef<() => void>(() => {});
  const autoSubmitPending = useRef(false);

  // ── Fire-and-forget submit (voice mode) ──
  const submitVoice = useCallback(async (text: string) => {
    if (!text.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setLastThought(null);

    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mode: captureMode }),
      });

      if (!res.ok) throw new Error("Failed to save thought");

      const result = await res.json();
      setLastThought({ ...result.thought, saved: true });
    } catch (err) {
      console.error("Voice save error:", err);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, captureMode]);

  const submitVoiceRef = useLatestRef(submitVoice);

  // ── Mode-aware transcript handler ──
  // In voice mode: fire-and-forget (auto-submit to API)
  // In write mode: append text to InlineCapture's textarea
  const handleTranscript = useCallback((text: string) => {
    if (writeModeRef.current) {
      editorAppendRef.current(text);
    } else {
      if (text.trim()) submitVoiceRef.current(text.trim());
    }
  }, []);

  const {
    isListening, isPaused, isConnecting, isTranscribing, pendingAudio,
    stream, startListening, stopListening, cancelListening,
    pauseListening, resumeListening, retryTranscription, discardPending,
  } = useVoiceInput({ onTranscript: handleTranscript });

  const { amplitudes, currentAmplitude } = useAudioAnalyser(stream, isListening && !isPaused);

  // ⌥. (Option+Period) hold-to-record shortcut
  useOptionPeriod(
    useCallback(() => { if (!isSubmitting && !isTranscribing && !isConnecting) startListening(); }, [isSubmitting, isTranscribing, isConnecting, startListening]),
    useCallback(() => { if (isListening) stopListening(); }, [isListening, stopListening]),
  );

  // ── Auto-submit after transcription in write mode ──
  // When mic is tapped to stop (not pause), autoSubmitPending is set.
  // After transcription completes and text lands in the editor, submit.
  const prevTranscribingRef = useRef(false);
  useEffect(() => {
    if (prevTranscribingRef.current && !isTranscribing && autoSubmitPending.current) {
      autoSubmitPending.current = false;
      // Small delay so setState from handleTranscript has flushed
      setTimeout(() => editorSubmitRef.current(), 50);
    }
    prevTranscribingRef.current = isTranscribing;
  }, [isTranscribing]);

  // Clear stale autoSubmitPending when leaving write mode
  useEffect(() => {
    if (!writeMode) autoSubmitPending.current = false;
  }, [writeMode]);

  // Elapsed timer
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

  const hasPendingAudio = pendingAudio !== null;

  // Amplitude-reactive button scale (1.0 – 1.08)
  const buttonScale = isListening && !isPaused
    ? 1 + currentAmplitude * 0.08
    : undefined;

  // ── Mode-aware button handlers ──

  const handleMicClick = useCallback(() => {
    if (hasPendingAudio && !isListening && !isTranscribing) {
      retryTranscription();
    } else if (isListening) {
      if (writeMode) {
        // Write mode: set autoSubmitPending, then stop → transcribe → text lands → auto-submit
        autoSubmitPending.current = true;
      }
      stopListening();
    } else if (!isSubmitting && !isTranscribing && !isConnecting) {
      startListening();
    }
  }, [hasPendingAudio, isListening, isTranscribing, isSubmitting, isConnecting, writeMode,
      retryTranscription, stopListening, startListening]);

  const handleRightButtonClick = useCallback(() => {
    if (writeMode) {
      // Write mode: stop and land text in textarea for review (no auto-submit)
      stopListening();
    } else {
      // Voice mode: pause/resume toggle
      isPaused ? resumeListening() : pauseListening();
    }
  }, [writeMode, isPaused, stopListening, resumeListening, pauseListening]);

  return (
    <div className="relative z-10 flex flex-col h-full">
      {/* Header — same position as other modes */}
      <div
        className="px-6 pb-3 shrink-0"
        style={{ paddingTop: "calc(2rem + env(safe-area-inset-top, 0px))" }}
      >
        <div className="w-full max-w-[560px] mx-auto">
          <h1
            className="font-black tracking-[-0.04em]"
            style={{ fontSize: "clamp(1.8rem, 5vw, 2.5rem)", color: "var(--text-primary)" }}
          >
            {writeMode ? (
              <>
                <span style={{ color: "var(--text-primary)" }}><span className="ignite-f">W</span>rite </span>
                <span className="shimmer-text" style={{ backgroundImage: theme.shimmerBg }}>freely.</span>
              </>
            ) : (
              <>
                <span style={{ color: "var(--text-primary)" }}><span className="ignite-f">F</span>ire and </span>
                <span className="shimmer-text" style={{ backgroundImage: theme.shimmerBg }}>forget.</span>
              </>
            )}
          </h1>
        </div>
      </div>

      {/* Content area above the voice buttons — scrollable */}
      <div
        className="flex-[13] overflow-y-auto flex flex-col items-center"
        style={{ overscrollBehavior: "contain" }}
      >
        {writeMode ? (
          <InlineCapture
            open={writeMode}
            onClose={() => setWriteMode(false)}
            appendTextRef={editorAppendRef}
            submitNoteRef={editorSubmitRef}
          />
        ) : (
          <>
            {/* Voice result card */}
            <div className="w-full max-w-sm px-6 mt-6" style={{ minHeight: "60px" }}>
              {!isSubmitting && lastThought && (
                <div className="animate-fade-up">
                  <ExpandableThought data={lastThought} formatMeta={formatMeta} />
                </div>
              )}
              {isSubmitting && (
                <div className="flex flex-col items-center justify-center py-4 animate-fade-up">
                  <span
                    className="dot-pulse inline-block w-2 h-2 rounded-full mb-2"
                    style={{ background: "var(--accent)" }}
                  />
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Saving…
                  </span>
                </div>
              )}
            </div>
            {/* Pen button — centered between result card and voice buttons */}
            <div className="my-auto">
              <InlineCaptureButton onClick={() => setWriteMode(true)} />
            </div>
          </>
        )}
      </div>

      {/* Voice buttons — always visible, always same position/size */}
      <div className="flex-[7] shrink-0 flex flex-col items-center pt-2">
        <div className="flex items-center gap-6">
          {/* Cancel / Discard button */}
          <button
            onClick={() => { hasPendingAudio && !isListening ? discardPending() : cancelListening(); }}
            className={`rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer ${
              isListening || (hasPendingAudio && !isTranscribing) ? "opacity-100 scale-100" : "opacity-20 scale-90"
            }`}
            disabled={!isListening && !(hasPendingAudio && !isTranscribing)}
            style={{
              width: "72px",
              height: "72px",
              background: "var(--accent-dim)",
              border: "2px solid var(--text-muted)",
            }}
            aria-label={hasPendingAudio && !isListening ? "Discard recording" : "Cancel recording"}
          >
            <X size={28} color="var(--text-muted)" />
          </button>

          {/* Main mic button */}
          <button
            onClick={handleMicClick}
            disabled={isSubmitting || isTranscribing}
            className={`talk-button rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${isListening ? `talk-button-recording${isPaused ? " talk-button-paused" : ""}` : isConnecting ? "talk-button-connecting" : ""}`}
            style={{
              width: "120px",
              height: "120px",
              background: isListening ? undefined : "var(--accent-dim)",
              border: isListening ? undefined : "2px solid var(--accent)",
              "--shimmer-bg": theme.shimmerBg,
              "--amp-scale": buttonScale ?? 1,
            } as React.CSSProperties}
            aria-label={isTranscribing ? "Transcribing…" : hasPendingAudio ? "Tap to retry" : isListening ? (writeMode ? "Tap to capture" : "Tap to stop") : isConnecting ? "Connecting…" : "Tap to talk"}
          >
            {isTranscribing ? (
              <span
                className="dot-pulse inline-block w-4 h-4 rounded-full"
                style={{ background: "var(--accent)" }}
              />
            ) : hasPendingAudio ? (
              <RotateCcw size={44} color="var(--accent)" />
            ) : (
              <Mic size={44} color="var(--accent)" fill={(isListening || isConnecting) ? "var(--accent-dim)" : "none"} style={{ transition: "fill 0.4s ease, stroke 0.4s ease" }} />
            )}
          </button>

          {/* Right button — pause/resume in voice mode, stop-and-review in write mode */}
          <button
            onClick={handleRightButtonClick}
            className={`rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer ${isListening ? "opacity-100 scale-100" : "opacity-20 scale-90"}`}
            disabled={!isListening}
            style={{
              width: "72px",
              height: "72px",
              background: "var(--accent-dim)",
              border: "2px solid var(--accent)",
            }}
            aria-label={writeMode ? "Stop and review" : (isPaused ? "Resume recording" : "Pause recording")}
          >
            {!writeMode && isPaused
              ? <Play size={28} color="var(--accent)" />
              : <Pause size={28} color="var(--accent)" />
            }
          </button>
        </div>

        {/* Live waveform */}
        <Waveform
          amplitudes={amplitudes}
          isRecording={isListening}
          isPaused={isPaused}
          elapsed={elapsed}
        />

        {/* Status text */}
        {(isTranscribing || (hasPendingAudio && !isListening)) && (
          <p className={`mt-4 ${isTranscribing ? "text-xs" : "text-sm"}`} style={{ color: "var(--text-muted)" }}>
            {isTranscribing
              ? "Audio saved · Transcribing…"
              : "Recording saved, but capture failed. Tap to try again."}
          </p>
        )}

        {/* Bottom spacer for nav */}
        <div className="h-16" />
      </div>
    </div>
  );
}
