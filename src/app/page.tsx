"use client";

/**
 * page.tsx — Main game orchestrator.
 *
 * State machine:  landing → config → loading → playing → gameover
 *                                       ↑__________________________|
 *
 * Connects the Configuration UI, the Wasm Web Worker, and the GameBoard
 * into a single game loop.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import Configuration from "@/src/components/Configuration";
import GameBoard from "@/src/components/GameBoard";
import {
  toggleBit,
  countSetBits,
  getValidMoves,
  NO_MOVE,
} from "@/src/lib/gameUtils";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type Phase = "landing" | "config" | "loading" | "playing" | "gameover";
type Winner = "Player" | "Bot";

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const BOT_DELAY_MS = 450;

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function Home() {
  /* ---- core game state ---- */
  const [phase, setPhase] = useState<Phase>("landing");
  const [m, setM] = useState(6);
  const [n, setN] = useState(3);
  const [currentBoard, setCurrentBoard] = useState(0);
  const [winner, setWinner] = useState<Winner | null>(null);

  /* ---- UI state ---- */
  const [errorBulb, setErrorBulb] = useState<number | null>(null);
  const [screenFlash, setScreenFlash] = useState(false);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);

  /* ---- refs (non-rendering data) ---- */
  const strategyRef = useRef<Uint16Array | null>(null);
  const visitedRef = useRef<Set<number>>(new Set([0]));
  const workerRef = useRef<Worker | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const boardRef = useRef(0); // mirrors currentBoard for use inside timeouts

  /* ---- cleanup worker on unmount ---- */
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  /* ================================================================ */
  /*  Phase transitions                                                */
  /* ================================================================ */

  /** Landing → Config */
  const handleTap = useCallback(() => setPhase("config"), []);

  /** Config → Loading → Playing */
  const handleStart = useCallback(
    (newM: number, newN: number) => {
      setM(newM);
      setN(newN);
      setPhase("loading");

      /* Terminate any previous worker. */
      workerRef.current?.terminate();

      const worker = new Worker("/solver.worker.js");
      workerRef.current = worker;

      worker.onmessage = (e: MessageEvent) => {
        const data = e.data;

        if (data.type === "READY") {
          worker.postMessage({ type: "COMPUTE", m: newM, n: newN });
          return;
        }

        if (data.type === "RESULT") {
          strategyRef.current = data.strategy as Uint16Array;
          visitedRef.current = new Set([0]);
          boardRef.current = 0;
          setCurrentBoard(0);
          setWinner(null);
          setIsPlayerTurn(true);
          setPhase("playing");
          return;
        }

        if (data.type === "ERROR") {
          console.error("[solver.worker]", data.message);
        }
      };

      worker.onerror = (err) => {
        console.error("[solver.worker] uncaught", err);
      };
    },
    []
  );

  /** GameOver → Config */
  const handlePlayAgain = useCallback(() => {
    setPhase("config");
    setWinner(null);
    strategyRef.current = null;
  }, []);

  /* ================================================================ */
  /*  Error flash helper                                               */
  /* ================================================================ */

  const flashError = useCallback((bulbIdx: number) => {
    clearTimeout(errorTimer.current);
    clearTimeout(flashTimer.current);

    setErrorBulb(bulbIdx);
    setScreenFlash(true);

    errorTimer.current = setTimeout(() => setErrorBulb(null), 350);
    flashTimer.current = setTimeout(() => setScreenFlash(false), 300);
  }, []);

  /* ================================================================ */
  /*  Core game logic                                                  */
  /* ================================================================ */

  const handleLampClick = useCallback(
    (bulbIdx: number) => {
      if (!isPlayerTurn || phase !== "playing") return;

      const board = boardRef.current;
      const nextState = toggleBit(board, bulbIdx);

      /* ---- Validate ---- */
      if (countSetBits(nextState) > n || visitedRef.current.has(nextState)) {
        flashError(bulbIdx);
        return;
      }

      /* ---- Apply player move ---- */
      visitedRef.current.add(nextState);
      boardRef.current = nextState;
      setCurrentBoard(nextState);
      setIsPlayerTurn(false);

      /* ---- Check if bot has any moves ---- */
      const botMoves = getValidMoves(nextState, m, n, visitedRef.current);

      if (botMoves.length === 0) {
        /* Bot cannot move → Player wins */
        setWinner("Player");
        setPhase("gameover");
        return;
      }

      /* ---- Bot turn (after a short delay for UX) ---- */
      setTimeout(() => {
        const strategy = strategyRef.current;
        let botMove: number | null = null;

        /* Try the optimal matching move first. */
        if (strategy) {
          const optimal = strategy[nextState];
          if (
            optimal !== NO_MOVE &&
            !visitedRef.current.has(optimal) &&
            countSetBits(optimal) <= n
          ) {
            botMove = optimal;
          }
        }

        /* Fallback: pick any legal move. */
        if (botMove === null) {
          const fallbacks = getValidMoves(
            boardRef.current,
            m,
            n,
            visitedRef.current
          );
          botMove = fallbacks.length > 0 ? fallbacks[0] : null;
        }

        if (botMove === null) {
          /* Safety net — should be caught above. */
          setWinner("Player");
          setPhase("gameover");
          return;
        }

        visitedRef.current.add(botMove);
        boardRef.current = botMove;
        setCurrentBoard(botMove);
        setIsPlayerTurn(true);

        /* ---- Check if player has any moves ---- */
        const playerMoves = getValidMoves(botMove, m, n, visitedRef.current);
        if (playerMoves.length === 0) {
          setWinner("Bot");
          setPhase("gameover");
        }
      }, BOT_DELAY_MS);
    },
    [isPlayerTurn, phase, m, n, flashError]
  );

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center min-h-screen bg-zinc-950 overflow-hidden">
      {/* ---- Ambient background glow ---- */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(245,158,11,0.06) 0%, transparent 70%)",
        }}
      />

      {/* ---- Screen-level error flash ---- */}
      <AnimatePresence>
        {screenFlash && (
          <motion.div
            key="screen-flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 pointer-events-none bg-red-900/40"
          />
        )}
      </AnimatePresence>

      {/* ---- Phase content ---- */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 w-full px-4 py-8">
        <AnimatePresence mode="wait">
          {/* ============ LANDING ============ */}
          {phase === "landing" && (
            <motion.button
              key="landing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5 }}
              onClick={handleTap}
              className="flex flex-col items-center gap-6 group cursor-pointer bg-transparent border-none"
            >
              {/* Pulsing bulb icon */}
              <motion.div
                animate={{
                  boxShadow: [
                    "0 0 20px 4px rgba(245,158,11,0.2)",
                    "0 0 40px 10px rgba(245,158,11,0.35)",
                    "0 0 20px 4px rgba(245,158,11,0.2)",
                  ],
                }}
                transition={{ duration: 2.5, repeat: Infinity }}
                className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400/20 to-amber-700/30 border border-amber-500/30 flex items-center justify-center"
              >
                <span className="text-3xl">💡</span>
              </motion.div>

              <div className="text-center space-y-2">
                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-zinc-100">
                  Lamp Game
                </h1>
                <p className="text-sm text-zinc-500 group-hover:text-zinc-400 transition-colors">
                  Tap to Play
                </p>
              </div>
            </motion.button>
          )}

          {/* ============ CONFIG ============ */}
          {phase === "config" && (
            <motion.div
              key="config"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35 }}
            >
              <Configuration onStart={handleStart} />
            </motion.div>
          )}

          {/* ============ LOADING ============ */}
          {phase === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center gap-5"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                className="w-10 h-10 rounded-full border-2 border-zinc-700 border-t-amber-400"
              />
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-zinc-300">
                  Computing Game Graph…
                </p>
                <p className="text-xs text-zinc-600">
                  Building {(1 << m).toLocaleString()} states via Hopcroft-Karp
                </p>
              </div>
            </motion.div>
          )}

          {/* ============ PLAYING ============ */}
          {phase === "playing" && (
            <motion.div
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center gap-8"
            >
              {/* Status bar */}
              <div className="text-center space-y-1">
                <p className="text-xs uppercase tracking-widest text-zinc-500">
                  {isPlayerTurn ? "Your Turn" : "Bot is thinking…"}
                </p>
                <p className="text-[11px] text-zinc-600 tabular-nums">
                  Moves played: {visitedRef.current.size - 1} ·{" "}
                  Bulbs ON: {countSetBits(currentBoard)}/{n}
                </p>
              </div>

              {/* Board */}
              <GameBoard
                m={m}
                currentBoard={currentBoard}
                errorBulb={errorBulb}
                disabled={!isPlayerTurn}
                onLampClick={handleLampClick}
              />

              {/* Subtle hint */}
              <p className="text-[10px] text-zinc-700 max-w-xs text-center">
                Toggle a bulb. No state may repeat; at most {n} bulb
                {n !== 1 ? "s" : ""} may glow at once.
              </p>
            </motion.div>
          )}

          {/* ============ GAME OVER ============ */}
          {phase === "gameover" && (
            <motion.div
              key="gameover"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="flex flex-col items-center gap-8 text-center"
            >
              <motion.div
                animate={{
                  boxShadow:
                    winner === "Player"
                      ? [
                          "0 0 30px 8px rgba(34,197,94,0.15)",
                          "0 0 50px 16px rgba(34,197,94,0.25)",
                          "0 0 30px 8px rgba(34,197,94,0.15)",
                        ]
                      : [
                          "0 0 30px 8px rgba(239,68,68,0.15)",
                          "0 0 50px 16px rgba(239,68,68,0.25)",
                          "0 0 30px 8px rgba(239,68,68,0.15)",
                        ],
                }}
                transition={{ duration: 2, repeat: Infinity }}
                className={[
                  "w-28 h-28 rounded-full flex items-center justify-center",
                  "border-2",
                  winner === "Player"
                    ? "border-emerald-500/40 bg-emerald-900/20"
                    : "border-red-500/40 bg-red-900/20",
                ].join(" ")}
              >
                <span className="text-5xl">
                  {winner === "Player" ? "🎉" : "🤖"}
                </span>
              </motion.div>

              <div className="space-y-2">
                <h2
                  className={[
                    "text-3xl sm:text-4xl font-bold tracking-tight",
                    winner === "Player" ? "text-emerald-400" : "text-red-400",
                  ].join(" ")}
                >
                  {winner === "Player" ? "You Win!" : "Game Over"}
                </h2>
                <p className="text-sm text-zinc-500">
                  {winner === "Player"
                    ? "The bot ran out of valid moves. Brilliant play!"
                    : "No valid moves left for you. The bot played perfectly."}
                </p>
              </div>

              <motion.button
                type="button"
                onClick={handlePlayAgain}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.96 }}
                className={[
                  "px-8 py-3 rounded-full text-sm font-semibold tracking-wide",
                  "bg-zinc-800 text-zinc-200 border border-zinc-700/60",
                  "hover:bg-zinc-700 transition-colors duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
                ].join(" ")}
              >
                Play Again
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
