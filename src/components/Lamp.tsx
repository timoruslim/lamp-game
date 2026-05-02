"use client";

/**
 * Lamp.tsx — A single light-bulb component with glow, click sound, and error flash.
 *
 * Visual states:
 *   OFF   → shows lamp_off.png
 *   ON    → shows lamp_on.png
 *   ERROR → brief red flash overlay (300 ms)
 *
 * Audio: Uses the Web Audio API to synthesize a short "click" or "buzz" tone
 *        so we don't need external audio files.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { playClickSound, playErrorSound } from "@/src/lib/audioUtils";

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
    let timer: ReturnType<typeof setTimeout>;
    if (isError) {
      setShowFlash(true);
      playErrorSound();
      timer = setTimeout(() => setShowFlash(false), 300);
    } else {
      setShowFlash(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isError]);

  /* ---- Hover state ---- */
  const [isHovered, setIsHovered] = useState(false);

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
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={!disabled ? { scale: 1.12 } : undefined}
      whileTap={!disabled ? { scale: 0.92 } : undefined}
      className="relative flex items-center justify-center"
      style={{ outline: "none" }}
    >


      {/* ---- Bulb body ---- */}
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={[
          "relative z-10 flex items-center justify-center",
          "w-20 h-20 sm:w-24 sm:h-24 md:w-[6.5rem] md:h-[6.5rem]",
          "cursor-pointer select-none",
          disabled ? "opacity-60 cursor-not-allowed" : "",
        ].join(" ")}
      >
        <img
          src={isOn ? "/icons/lamp_on.png" : "/icons/lamp_off.png"}
          alt={`Lamp ${index + 1}`}
          className="w-full h-full object-contain transition-all duration-300"
          style={{
            filter: isOn
              ? `drop-shadow(0 0 8px rgba(251,191,36,0.8)) drop-shadow(0 0 ${isHovered && !disabled ? '32px rgba(251,191,36,0.7)' : '20px rgba(251,191,36,0.45)'})`
              : `drop-shadow(0 0 4px rgba(255,255,255,0.5)) drop-shadow(0 0 ${isHovered && !disabled ? '20px rgba(255,255,255,0.7)' : '12px rgba(255,255,255,0.5)'})`,
          }}
        />
        {/* Filament / index label */}
        <span
          className={[
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -mt-3 text-[10px] sm:text-xs font-mono font-bold transition-colors duration-200",
            isOn ? "text-amber-950" : "text-white",
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
              background: "radial-gradient(circle, rgba(220,38,38,0.5) 0%, rgba(220,38,38,0.15) 70%)",
              boxShadow: "0 0 24px 6px rgba(220,38,38,0.3)",
            }}
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
}
