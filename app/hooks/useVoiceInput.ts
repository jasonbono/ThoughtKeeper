import { useState, useRef, useCallback, useEffect } from "react";
import { saveAudio, loadAudio, clearAudio } from "@/lib/audioStore";

interface UseVoiceInputOptions {
  onTranscript: (text: string) => void;
}

export function useVoiceInput({ onTranscript }: UseVoiceInputOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [pendingAudio, setPendingAudio] = useState<"failed" | "found" | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const supported =
    typeof window !== "undefined" && typeof navigator?.mediaDevices?.getUserMedia === "function";

  // Check for orphaned audio on mount
  useEffect(() => {
    loadAudio().then((data) => {
      if (data) setPendingAudio("found");
    }).catch(() => {});
  }, []);

  const startListening = useCallback(async () => {
    if (isListening || isConnecting || isTranscribing) return;
    setIsConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Prefer webm (Chrome/Firefox), fall back to mp4 (Safari)
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stop all tracks to release the microphone
        stream.getTracks().forEach((t) => t.stop());
        setStream(null);

        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size === 0) return;

        // Persist audio before transcription attempt
        try {
          await saveAudio(blob, mimeType);
        } catch (e) {
          console.error("[voice] IndexedDB save failed, continuing:", e);
        }

        setIsTranscribing(true);
        try {
          const ext = mimeType.includes("webm") ? "webm" : "m4a";
          const formData = new FormData();
          formData.append("audio", blob, `recording.${ext}`);

          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) throw new Error("Transcription failed");
          const { text } = await res.json();
          if (text?.trim()) onTranscript(text.trim());
          // Success — clear the safety net
          clearAudio().catch(() => {});
          setPendingAudio(null);
        } catch (err) {
          console.error("[voice] transcription error:", err);
          setPendingAudio("failed");
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start(1000); // collect in 1s chunks for reliability
      mediaRecorderRef.current = recorder;
      setStream(stream);
      setIsConnecting(false);
      setIsListening(true);
    } catch (err) {
      console.error("[voice] mic access error:", err);
      setIsConnecting(false);
    }
  }, [isListening, isConnecting, isTranscribing, onTranscript]);

  const stopListening = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    setIsListening(false);
    setIsPaused(false);
  }, []);

  const cancelListening = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      // Remove onstop handler so no transcription happens
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((t) => t.stop());
      };
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    clearAudio().catch(() => {});
    setPendingAudio(null);
    setStream(null);
    setIsListening(false);
    setIsPaused(false);
  }, []);

  const pauseListening = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.pause();
      setIsPaused(true);
    }
  }, []);

  const resumeListening = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "paused") {
      recorder.resume();
      setIsPaused(false);
    }
  }, []);

  const retryTranscription = useCallback(async () => {
    if (isTranscribing) return;
    setIsTranscribing(true);
    try {
      const data = await loadAudio();
      if (!data) {
        setPendingAudio(null);
        return;
      }
      const { blob, mimeType } = data;
      const ext = mimeType.includes("webm") ? "webm" : "m4a";
      const formData = new FormData();
      formData.append("audio", blob, `recording.${ext}`);

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Transcription failed");
      const { text } = await res.json();
      if (text?.trim()) onTranscript(text.trim());
      clearAudio().catch(() => {});
      setPendingAudio(null);
    } catch (err) {
      console.error("[voice] retry transcription error:", err);
    } finally {
      setIsTranscribing(false);
    }
  }, [isTranscribing, onTranscript]);

  const discardPending = useCallback(() => {
    clearAudio().catch(() => {});
    setPendingAudio(null);
  }, []);

  return {
    isListening, isPaused, isConnecting, isTranscribing, pendingAudio,
    supported, stream, startListening, stopListening, cancelListening,
    pauseListening, resumeListening, retryTranscription, discardPending,
  };
}
