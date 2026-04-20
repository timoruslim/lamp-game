"use client";

/**
 * Lamp.tsx — A single light-bulb component with glow, click sound, and error flash.
 *
 * Visual states:
 *   OFF   → dark zinc circle, subtle border
 *   ON    → warm amber glow (box-shadow + background gradient)
 *   ERROR → brief red flash overlay (300 ms)
 *
 * Audio: Uses the Web Audio API to synthesize a short "click" or "buzz" tone
 *        so we don't need external audio files.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ------------------------------------------------------------------ */
/*  Props                                                             */
/* ------------------------------------------------------------------ */

export interface LampProps {
  /** 0-based index of this bulb (used for stagger & label). */
  index: number;
  /** Whether the bulb is currently ON. */
  isOn: boolean;
  /** Fired when the user clicks this bulb. */
  onClick: () => void;
  /** When true, flash the bulb red for ~300 ms. */
  isError: boolean;
  /** If true, clicks are ignored (e.g. during the bot's turn). */
  disabled?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Tiny Web Audio helpers (no external files needed)                  */
/* ------------------------------------------------------------------ */

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/** Short tonal "click" — a quick sine blip. */
function playClickSound(): void {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    /* AudioContext may not be available in some environments. */
  }
}

/** Harsh "buzz" for invalid moves — a low sawtooth burst. */
function playErrorSound(): void {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 110;
    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    /* Swallow audio errors gracefully. */
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function Lamp({
  index,
  isOn,
  onClick,
  isError,
  disabled = false,
}: LampProps) {
  /* ---- Error flash timer ---- */
  const [showFlash, setShowFlash] = useState(false);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isError) {
      setShowFlash(true);
      playErrorSound();
      flashTimeout.current = setTimeout(() => setShowFlash(false), 300);
    }
    return () => {
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
    };
  }, [isError]);

  /* ---- Click handler ---- */
  const handleClick = useCallback(() => {
    if (disabled) return;
    playClickSound();
    onClick();
  }, [disabled, onClick]);

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={`Bulb ${index + 1} — ${isOn ? "ON" : "OFF"}`}
      whileHover={!disabled ? { scale: 1.12 } : undefined}
      whileTap={!disabled ? { scale: 0.92 } : undefined}
      className="relative flex items-center justify-center"
      style={{ outline: "none" }}
    >
      {/* ---- Outer glow ring (visible when ON) ---- */}
      <motion.div
        animate={{
          opacity: isOn ? 1 : 0,
          scale: isOn ? 1 : 0.8,
        }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(251,191,36,0.25) 0%, transparent 70%)",
          filter: "blur(8px)",
        }}
      />

      {/* ---- Bulb body ---- */}
      <motion.div
        layout
        animate={{
          background: isOn
            ? "radial-gradient(circle at 40% 35%, #fde68a, #f59e0b, #b45309)"
            : "radial-gradient(circle at 40% 35%, #3f3f46, #27272a, #18181b)",
          boxShadow: isOn
            ? "0 0 20px 4px rgba(245,158,11,0.5), 0 0 60px 8px rgba(251,191,36,0.2)"
            : "0 0 8px 0px rgba(0,0,0,0.6), inset 0 2px 4px rgba(255,255,255,0.04)",
        }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={[
          "relative z-10 flex items-center justify-center rounded-full",
          "w-14 h-14 sm:w-16 sm:h-16 md:w-[4.5rem] md:h-[4.5rem]",
          "border border-zinc-700/60",
          "cursor-pointer select-none",
          disabled ? "opacity-60 cursor-not-allowed" : "",
        ].join(" ")}
      >
        {/* Filament / index label */}
        <span
          className={[
            "text-xs font-mono font-bold transition-colors duration-200",
            isOn ? "text-amber-950/80" : "text-zinc-500",
          ].join(" ")}
        >
          {index + 1}
        </span>
      </motion.div>

      {/* ---- Error flash overlay ---- */}
      <AnimatePresence>
        {showFlash && (
          <motion.div
            key="error-flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-[-6px] rounded-full z-20 pointer-events-none"
            style={{
              background: "radial-gradient(circle, rgba(153,27,27,0.7) 0%, rgba(127,29,29,0.3) 70%)",
              boxShadow: "0 0 24px 6px rgba(220,38,38,0.4)",
            }}
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
}
