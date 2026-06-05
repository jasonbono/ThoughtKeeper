import { useEffect, useRef, useState } from "react";

const BUFFER_SIZE = 128; // number of bars in the waveform history
const SMOOTHING = 0.3; // EMA smoothing (lower = snappier)

export function useAudioAnalyser(stream: MediaStream | null, active: boolean) {
  const [amplitudes, setAmplitudes] = useState<number[]>(() => new Array(BUFFER_SIZE).fill(0));
  const [currentAmplitude, setCurrentAmplitude] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const bufferRef = useRef<number[]>(new Array(BUFFER_SIZE).fill(0));
  const smoothedRef = useRef(0);
  const lastPushRef = useRef(0);

  // AudioContext lifecycle — tied to stream
  useEffect(() => {
    if (!stream) {
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
      analyserRef.current = null;
      bufferRef.current = new Array(BUFFER_SIZE).fill(0);
      smoothedRef.current = 0;
      return;
    }

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    ctxRef.current = audioCtx;
    analyserRef.current = analyser;

    return () => {
      audioCtx.close().catch(() => {});
      ctxRef.current = null;
      analyserRef.current = null;
    };
  }, [stream]);

  // Sampling loop — tied to active (pause stops sampling, preserves buffer)
  useEffect(() => {
    if (!active || !analyserRef.current) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      return;
    }

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    lastPushRef.current = 0;

    const tick = (now: number) => {
      analyser.getByteTimeDomainData(dataArray);

      // Compute RMS amplitude (0-1)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      // Normalize — typical speech RMS is 0.02-0.15, scale up for visual impact
      const normalized = Math.min(1, rms * 5);

      // Smooth for button reactivity (fast attack, slower decay)
      const prev = smoothedRef.current;
      smoothedRef.current = normalized > prev
        ? prev + (normalized - prev) * 0.5   // fast attack
        : prev + (normalized - prev) * SMOOTHING; // slow decay
      setCurrentAmplitude(smoothedRef.current);

      // Push to waveform buffer every ~50ms (~20 bars/sec)
      if (now - lastPushRef.current > 50) {
        lastPushRef.current = now;
        const buf = bufferRef.current;
        buf.push(smoothedRef.current);
        if (buf.length > BUFFER_SIZE) buf.shift();
        setAmplitudes([...buf]);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [active]);

  return { amplitudes, currentAmplitude };
}
