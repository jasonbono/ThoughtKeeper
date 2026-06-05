"use client";

import { useRef, useEffect, useState } from "react";

interface Props {
  amplitudes: number[];
  isRecording: boolean;
  isPaused: boolean;
  elapsed: number; // seconds
}

const BAR_WIDTH = 3;
const BAR_GAP = 2;
const MIN_BAR = 0.06; // minimum bar height fraction
const HEIGHT = 56;

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function Waveform({ amplitudes, isRecording, isPaused, elapsed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Animate entrance/exit with delayed unmount
  useEffect(() => {
    if (isRecording) {
      setMounted(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 300); // match transition duration
      return () => clearTimeout(t);
    }
  }, [isRecording]);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const accent = getComputedStyle(canvas).getPropertyValue("--accent").trim() || "#f472b6";
    const midY = h / 2;
    const maxBarH = midY - 2;
    const totalBarW = BAR_WIDTH + BAR_GAP;
    const barCount = Math.floor(w / totalBarW);

    // Take the last N amplitudes that fit
    const start = Math.max(0, amplitudes.length - barCount);
    const slice = amplitudes.slice(start);

    for (let i = 0; i < slice.length; i++) {
      const amp = Math.max(MIN_BAR, slice[i]);
      const barH = amp * maxBarH;
      const x = i * totalBarW;

      // Opacity scales with amplitude
      const alpha = 0.3 + amp * 0.7;
      ctx.fillStyle = accent;
      ctx.globalAlpha = isPaused ? alpha * 0.4 : alpha;

      // Top half
      ctx.beginPath();
      ctx.roundRect(x, midY - barH, BAR_WIDTH, barH, 1.5);
      ctx.fill();

      // Bottom half (mirror)
      ctx.beginPath();
      ctx.roundRect(x, midY, BAR_WIDTH, barH, 1.5);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }, [amplitudes, isPaused]);

  return (
    <div
      className="flex items-center gap-3 w-full max-w-[320px] mx-auto mt-6 px-2"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transition: "opacity 300ms ease, transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        pointerEvents: "none",
        height: mounted ? `${HEIGHT}px` : "0px",
        overflow: "hidden",
      }}
    >
      <span
        className="text-xs tabular-nums shrink-0"
        style={{
          color: "var(--text-muted)",
          fontFamily: "monospace",
          minWidth: "2.5em",
          opacity: isPaused ? 0.4 : 0.7,
        }}
      >
        {formatTime(elapsed)}
      </span>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: `${HEIGHT}px` }}
      />
    </div>
  );
}
