"use client";

/**
 * Configuration.tsx — Game setup screen.
 *
 * Lets the user pick:
 *   m  = total number of bulbs  (1–16)
 *   n  = max bulbs ON at once   (1–m)
 *
 * Features:
 *   • Framer Motion staggered entrance of preview bulbs as m changes.
 *   • Clamping logic so n can never exceed m.
 *   • Clean light-mode aesthetic.
 */

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { playButtonClickSound, playSliderSound } from "@/src/lib/audioUtils";

/* ------------------------------------------------------------------ */
/*  Props                                                             */
/* ------------------------------------------------------------------ */

export interface ConfigurationProps {
  initialM: number;
  initialN: number;
  /** Called when the user clicks "Start Game". */
  onStart: (m: number, n: number, userIsFirst: boolean) => void;
}

/* ------------------------------------------------------------------ */
/*  Animation variants                                                */
/* ------------------------------------------------------------------ */

const bulbVariants = {
  hidden: { opacity: 0, scale: 0.3, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      delay: i * 0.045,
      type: "spring" as const,
      stiffness: 420,
      damping: 18,
    },
  }),
  exit: {
    opacity: 0,
    scale: 0.4,
    y: -8,
    transition: { duration: 0.15 },
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function Configuration({ initialM, initialN, onStart }: ConfigurationProps) {
  const [m, setM] = useState(initialM);
  const [n, setN] = useState(initialN);
  const [userIsFirst, setUserIsFirst] = useState(true);

  /* Clamp n whenever m changes. */
  useEffect(() => {
    if (n > m) setN(m);
  }, [m, n]);

  const handleMChange = useCallback((val: number) => {
    playSliderSound();
    setM(val);
  }, []);

  const handleNChange = useCallback(
    (val: number) => {
      playSliderSound();
      setN(Math.min(val, m));
    },
    [m]
  );

  const handleStart = useCallback(() => {
    playButtonClickSound();
    onStart(m, n, userIsFirst);
  }, [m, n, userIsFirst, onStart]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center gap-10 w-full max-w-xl mx-auto px-6"
    >
      {/* ---- Title ---- */}
      <div className="text-center space-y-2 drop-shadow-md">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
          Configure Game
        </h1>
        <p className="text-sm text-zinc-300 max-w-xs mx-auto leading-relaxed">
          Choose the number of bulbs and the maximum that may glow at once.
        </p>
      </div>

      {/* ---- Sliders ---- */}
      <div className="w-full space-y-8">
        {/* M slider */}
        <SliderRow
          label="Total Bulbs"
          symbol="m"
          value={m}
          min={1}
          max={12}
          onChange={handleMChange}
        />

        {/* N slider */}
        <SliderRow
          label="Max ON"
          symbol="n"
          value={n}
          min={1}
          max={m}
          onChange={handleNChange}
        />
      </div>

      {/* ---- Preview Bulbs ---- */}
      <div className="w-full">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3 text-center">
          Preview
        </p>

        <div 
          className="flex flex-wrap items-center justify-center mx-auto"
          style={{ maxWidth: `${(m <= 6 ? m : Math.ceil(m / 2)) * 40}px` }}
        >
          <AnimatePresence mode="popLayout">
            {Array.from({ length: m }, (_, i) => (
              <motion.div
                key={`preview-${i}`}
                custom={i}
                variants={bulbVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                layout
                className="w-10 h-10 flex items-center justify-center relative"
              >
                <img
                  src={i < n ? "/icons/lamp_on.png" : "/icons/lamp_off.png"}
                  alt={`Preview lamp ${i + 1}`}
                  className="w-full h-full object-contain"
                />
                <span className={[
                  "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -mt-0.5 text-[9px] font-mono font-bold",
                  i < n ? "text-amber-950" : "text-zinc-600"
                ].join(" ")}>
                  {i + 1}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <p className="text-[11px] text-zinc-300 text-center mt-3">
          First{" "}
          <span className="text-amber-500 font-semibold inline-block w-3.5 text-center">{n}</span>{" "}
          bulbs highlighted — at most{" "}
          <span className="text-amber-500 font-semibold inline-block w-3.5 text-center">{n}</span>{" "}
          may be on simultaneously.
        </p>
      </div>

      {/* ---- Player Order Toggle ---- */}
      <div className="flex bg-white/5 backdrop-blur-md border border-white/10 rounded-full p-1">
        <button
          type="button"
          onClick={() => {
            playButtonClickSound();
            setUserIsFirst(true);
          }}
          className={[
            "px-6 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer",
            userIsFirst
              ? "bg-amber-500 text-amber-950"
              : "text-zinc-400 hover:text-zinc-200",
          ].join(" ")}
        >
          Play First
        </button>
        <button
          type="button"
          onClick={() => {
            playButtonClickSound();
            setUserIsFirst(false);
          }}
          className={[
            "px-6 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer",
            !userIsFirst
              ? "bg-amber-500 text-amber-950"
              : "text-zinc-400 hover:text-zinc-200",
          ].join(" ")}
        >
          Play Second
        </button>
      </div>

      {/* ---- Start Button ---- */}
      <motion.button
        type="button"
        onClick={handleStart}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        className={[
          "relative px-10 py-3.5 rounded-full font-semibold text-sm tracking-wide",
          "bg-gradient-to-r from-amber-500 to-orange-500",
          "text-white shadow-lg shadow-amber-500/25 cursor-pointer",
          "hover:shadow-amber-500/40 transition-shadow duration-300",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
        ].join(" ")}
      >
        Start Game
      </motion.button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Slider sub-component                                              */
/* ------------------------------------------------------------------ */

interface SliderRowProps {
  label: string;
  symbol: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

function SliderRow({ label, symbol, value, min, max, onChange }: SliderRowProps) {
  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-zinc-300">
          {label}{" "}
          <span className="text-zinc-500 font-normal italic">({symbol})</span>
        </label>
        <span className="text-lg font-bold tabular-nums text-amber-500">
          {value}
        </span>
      </div>

      {/* Slider */}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={[
          "w-full h-1.5 rounded-full appearance-none cursor-pointer",
          "bg-white/10",
          /* Webkit thumb */
          "[&::-webkit-slider-thumb]:appearance-none",
          "[&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4",
          "[&::-webkit-slider-thumb]:rounded-full",
          "[&::-webkit-slider-thumb]:bg-amber-500",
          "[&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(245,158,11,0.4)]",
          "[&::-webkit-slider-thumb]:transition-transform",
          "[&::-webkit-slider-thumb]:hover:scale-125",
          /* Firefox thumb */
          "[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4",
          "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0",
          "[&::-moz-range-thumb]:bg-amber-500",
          "[&::-moz-range-thumb]:shadow-[0_0_8px_rgba(245,158,11,0.4)]",
        ].join(" ")}
      />

      {/* Ticks */}
      <div className="flex justify-between px-0.5">
        <span className="text-[10px] text-zinc-500">{min}</span>
        <span className="text-[10px] text-zinc-500">{max}</span>
      </div>
    </div>
  );
}
