"use client";

/**
 * Gauntlet Hub — Displays 5 pre-configured game stages.
 *
 * Each stage can be played exactly once (win or lose).
 * Completed stages are greyed out and unclickable.
 * The user picks their turn order before launching each stage.
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getGauntletProgress,
  type GauntletProgress,
  type StageResult,
} from "@/src/lib/gauntletStorage";
import { playButtonClickSound } from "@/src/lib/audioUtils";

/* ------------------------------------------------------------------ */
/*  Stage definitions                                                  */
/* ------------------------------------------------------------------ */

interface StageConfig {
  id: number;
  title: string;
  subtitle: string;
  gameType: "lamp" | "coin";
  /** Lamp: m = total bulbs, n = max ON. Coin: n = rows, m = cols. */
  params: { m: number; n: number };
  rules: string;
}

const stages: StageConfig[] = [
  { id: 1, title: "Stage 1", subtitle: "The first spark dictates the future. Find the golden loop, strike first, and never stray from the path.", gameType: "lamp", params: { m: 7, n: 3 }, rules: "Toggle 1 of 7 bulbs per turn. No state may repeat; at most 3 bulbs may glow at once." },
  { id: 2, title: "Stage 2", subtitle: "An unbalanced circuit where the shadows favor the patient. Sometimes, it is wiser to follow than to lead.", gameType: "lamp", params: { m: 6, n: 3 }, rules: "Toggle 1 of 6 bulbs per turn. No state may repeat; at most 3 bulbs may glow at once." },
  { id: 3, title: "Stage 3", subtitle: "The cage expands. A wider web grants more room to breathe, but gives you much more rope to hang yourself with.", gameType: "lamp", params: { m: 6, n: 4 }, rules: "Toggle 1 of 6 bulbs per turn. No state may repeat; at most 4 bulbs may glow at once." },
  { id: 4, title: "Stage 4", subtitle: "A perfectly symmetric battlefield. The aggressor is mathematically doomed; the mimic shall inherit the board.", gameType: "coin", params: { m: 10, n: 10 }, rules: "Place a coin on a 10×10 grid. Coins block all 4 neighbors. The player with no valid moves loses." },
  { id: 5, title: "Stage 5", subtitle: "An odd realm with a true heart. Claim the absolute center on your first breath, and let the mirror seal their fate.", gameType: "coin", params: { m: 9, n: 11 }, rules: "Place a coin on a 11×9 grid. Coins block all 4 neighbors. The player with no valid moves loses." },
];

/* ------------------------------------------------------------------ */
/*  Result badge component                                             */
/* ------------------------------------------------------------------ */

function ResultBadge({ result }: { result: StageResult }) {
  const isWin = result === "completed_win";
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider",
        isWin
          ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
          : "bg-red-100 text-red-700 border border-red-200",
      ].join(" ")}
    >
      {isWin ? "✓ Won" : "✗ Lost"}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function GauntletHub() {
  const router = useRouter();
  const [progress, setProgress] = useState<GauntletProgress>({});
  const [expandedStage, setExpandedStage] = useState<number | null>(null);

  /* Load progress from localStorage */
  useEffect(() => {
    setProgress(getGauntletProgress());
  }, []);

  const handleStageClick = useCallback(
    (stage: StageConfig) => {
      if (progress[String(stage.id)]) return; // already completed
      playButtonClickSound();
      setExpandedStage((prev) => (prev === stage.id ? null : stage.id));
    },
    [progress]
  );

  const handleLaunch = useCallback(
    (stage: StageConfig, userIsFirst: boolean) => {
      playButtonClickSound();
      const basePath = stage.gameType === "lamp" ? "/lamp" : "/coin";
      const params = new URLSearchParams({
        m: String(stage.params.m),
        n: String(stage.params.n),
        gauntletMode: "true",
        gauntletStage: String(stage.id),
        botFirst: String(!userIsFirst),
      });
      router.push(`${basePath}?${params.toString()}`);
    },
    [router]
  );

  /* Count progress */
  const completedCount = Object.keys(progress).length;
  const winCount = Object.values(progress).filter((r) => r === "completed_win").length;

  return (
    <div className="relative flex flex-col items-center min-h-screen bg-slate-50 overflow-hidden text-zinc-800">
      {/* Ambient background glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(220,38,38,0.04) 0%, transparent 70%)",
        }}
      />

      {/* Back button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed top-6 left-6 z-[60]"
      >
        <Link
          href="/"
          className="p-3 text-zinc-400 hover:text-zinc-700 transition-all duration-300 flex items-center justify-center"
        >
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </Link>
      </motion.div>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="z-10 text-center pt-20 pb-10 px-4"
      >
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-amber-500">
          ITBMO Gauntlet
        </h1>
        <p className="text-sm text-zinc-400 mt-3 max-w-md mx-auto">
          Win or lose, you only get one shot at each.
        </p>
        {completedCount > 0 && (
          <p className="text-xs text-zinc-400 mt-2 tabular-nums">
            {completedCount}/5 completed · {winCount} won
          </p>
        )}
      </motion.div>

      {/* Stage list */}
      <div className="z-10 flex flex-col gap-4 w-full max-w-lg px-4 pb-20">
        {stages.map((stage, i) => {
          const result = progress[String(stage.id)] as StageResult | undefined;
          const isCompleted = !!result;
          const isExpanded = expandedStage === stage.id;
          const isLamp = stage.gameType === "lamp";

          return (
            <motion.div
              key={stage.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              <div
                onClick={() => handleStageClick(stage)}
                className={[
                  "relative rounded-2xl overflow-hidden border transition-all duration-300",
                  isCompleted
                    ? "opacity-50 cursor-not-allowed border-zinc-200 bg-zinc-100"
                    : "cursor-pointer border-zinc-200 bg-white hover:border-amber-400/60 hover:shadow-md",
                ].join(" ")}
              >
                {/* Decorative background pattern */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {isLamp ? (
                    /* Lamp pattern — scattered lamp icons */
                    <div className="absolute inset-0 flex flex-wrap items-center justify-end gap-4 pr-6 opacity-[0.25]">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <img
                          key={j}
                          src="/icons/lamp_on.png"
                          alt=""
                          className="w-14 h-14 object-contain"
                          style={{ transform: `rotate(${(j - 2) * 8}deg) translateY(${(j % 2) * 6}px)` }}
                        />
                      ))}
                    </div>
                  ) : (
                    /* Coin pattern — scattered coin circles */
                    <div className="absolute inset-0 flex flex-wrap items-center justify-end gap-3 pr-6 opacity-[0.08]">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <div
                          key={j}
                          className="w-10 h-10 rounded-full border-2 border-amber-400 flex items-center justify-center"
                          style={{
                            background: "linear-gradient(135deg, #fef08a 0%, #f59e0b 50%, #b45309 100%)",
                            transform: `translateY(${(j % 3 - 1) * 8}px)`,
                          }}
                        >
                          <span className="text-amber-950 font-serif text-sm font-bold">$</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card content */}
                <div className="relative z-10 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-zinc-800">
                          {stage.title}
                        </span>
                        {result && <ResultBadge result={result} />}
                      </div>
                      <p className="text-sm text-zinc-400 mt-1">
                        {stage.subtitle}
                      </p>
                    </div>

                    {!isCompleted && (
                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </motion.div>
                    )}
                  </div>

                  {/* Expanded: turn order selection */}
                  <AnimatePresence>
                    {isExpanded && !isCompleted && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-4 pb-1 px-1 flex flex-col gap-3">
                          <div className="flex items-center gap-3">
                            <motion.button
                              type="button"
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.96 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLaunch(stage, true);
                              }}
                              className="flex-1 px-3 py-2 rounded-full text-xs font-semibold bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-sm cursor-pointer hover:shadow-amber-500/30 transition-shadow"
                            >
                              Play First
                            </motion.button>
                            <motion.button
                              type="button"
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.96 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLaunch(stage, false);
                              }}
                              className="flex-1 px-3 py-2 rounded-full text-xs font-semibold bg-white text-zinc-700 border border-zinc-200 shadow-sm cursor-pointer hover:bg-zinc-50 transition-colors"
                            >
                              Play Second
                            </motion.button>
                          </div>
                          <p className="text-[11px] text-zinc-400 leading-relaxed">
                            {stage.rules}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
