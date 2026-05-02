"use client";

/**
 * page.tsx — Main game orchestrator.
 *
 * State machine:  landing → config → loading → playing → ending → gameover
 *                                       ↑________________________________|
 *
 * Connects the Configuration UI, the Wasm Web Worker, and the GameBoard
 * into a single game loop.
 */

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { setParticipantStageResult } from "@/src/lib/gauntletStorage";

import Configuration from "@/src/components/Configuration";
import GameBoard from "@/src/components/GameBoard";
import VisitedPanel from "@/src/components/VisitedPanel";
import {
  toggleBit,
  countSetBits,
  getValidMoves,
  NO_MOVE,
} from "@/src/lib/gameUtils";
import {
  playButtonClickSound,
  playWinDetectedSound,
  playLoseDetectedSound,
  playFlickerSound,
} from "@/src/lib/audioUtils";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type Phase = "landing" | "config" | "loading" | "playing" | "ending" | "gameover";
type Winner = "Player" | "Bot";

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const BOT_DELAY_MS = 450;

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

function LampGameInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  /* ---- Gauntlet mode detection ---- */
  const gauntletMode = searchParams.get("gauntletMode") === "true";
  const gauntletStage = searchParams.get("gauntletStage") ? Number(searchParams.get("gauntletStage")) : null;
  const gauntletM = searchParams.get("m") ? Number(searchParams.get("m")) : null;
  const gauntletN = searchParams.get("n") ? Number(searchParams.get("n")) : null;
  const gauntletBotFirst = searchParams.get("botFirst") === "true";
  const gauntletParticipantId = searchParams.get("participantId") ?? "";

  /* ---- core game state ---- */
  const [phase, setPhase] = useState<Phase>(gauntletMode ? "loading" : "landing");
  const [m, setM] = useState(gauntletM ?? 7);
  const [n, setN] = useState(gauntletN ?? 3);
  const [currentBoard, setCurrentBoard] = useState(0);
  const [winner, setWinner] = useState<Winner | null>(null);

  /* ---- UI state ---- */
  const [errorBulb, setErrorBulb] = useState<number | null>(null);
  const [screenFlash, setScreenFlash] = useState(false);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [visitedArr, setVisitedArr] = useState<number[]>([0]);
  const [highlightState, setHighlightState] = useState<number | null>(null);

  /* ---- refs (non-rendering data) ---- */
  const strategyRef = useRef<Uint16Array | null>(null);
  const visitedRef = useRef<Set<number>>(new Set([0]));
  const workerRef = useRef<Worker | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const boardRef = useRef(0); // mirrors currentBoard for use inside timeouts
  const applyBotMoveRef = useRef<(move: number) => void>(() => {});
  const lastMoveIdx = useRef<number | null>(null);
  const gauntletAutoStarted = useRef(false);
  const surrenderedRef = useRef(false);

  /* ---- cleanup worker on unmount ---- */
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  /* ================================================================ */
  /*  Ending sequence logic                                           */
  /* ================================================================ */

  useEffect(() => {
    if (phase !== "ending" || winner === null) return;

    let isMounted = true;

    const runEndingSequence = async () => {
      // 1. Wait a bit after the final move (skip if surrendered)
      if (!surrenderedRef.current) {
        await new Promise((r) => setTimeout(r, 900));
      }
      if (!isMounted) return;

      // 2. Horror movie flicker on the last moved bulb
      if (lastMoveIdx.current !== null) {
        const bit = 1 << lastMoveIdx.current;
        for (let j = 0; j < 5; j++) {
          setCurrentBoard((prev) => prev ^ bit);
          playFlickerSound();
          await new Promise((r) => setTimeout(r, 60 + Math.random() * 80));
          if (!isMounted) return;
        }
        // Ensure it ends up in the correct state it was supposed to be before cascade
        setCurrentBoard(boardRef.current);
        await new Promise((r) => setTimeout(r, 500));
        if (!isMounted) return;
      }

      // 3. Turn all lamps ON (win) or OFF (loss) sequentially
      const isWin = winner === "Player";
      
      for (let i = 0; i < m; i++) {
        if (!isMounted) return;
        setCurrentBoard((prev) => {
          const bit = 1 << i;
          return isWin ? (prev | bit) : (prev & ~bit);
        });
        await new Promise((r) => setTimeout(r, 120));
      }

      // 4. Hold for dramatic effect
      await new Promise((r) => setTimeout(r, 900));
      if (!isMounted) return;

      // 5. Proceed to gameover screen
      setPhase("gameover");
    };

    runEndingSequence();

    return () => {
      isMounted = false;
    };
  }, [phase, winner, m]);

  const triggerGameEnd = useCallback((w: Winner) => {
    setWinner(w);
    setPhase("ending");
    if (w === "Player") {
      playWinDetectedSound();
    } else {
      playLoseDetectedSound();
    }
  }, []);

  /* ================================================================ */
  /*  Phase transitions                                                */
  /* ================================================================ */

  /** Landing → Config */
  const handleTap = useCallback(() => {
    if (phase === "landing") {
      playButtonClickSound();
      setPhase("config");
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "landing") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") handleTap();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, handleTap]);

  /** Config → Loading → Playing */
  const handleStart = useCallback(
    (newM: number, newN: number, userIsFirst: boolean) => {
      setM(newM);
      setN(newN);
      setPhase("loading");
      surrenderedRef.current = false;

      /* Terminate any previous worker. */
      workerRef.current?.terminate();

      const worker = new Worker("/wasm/lamp.worker.js");
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
          setVisitedArr([0]);
          boardRef.current = 0;
          setCurrentBoard(0);
          setWinner(null);
          setIsPlayerTurn(userIsFirst);
          setPhase("playing");

          if (!userIsFirst) {
            // Bot needs to play the first move!
            worker.postMessage({
              type: "BEST_MOVE",
              m: newM,
              n: newN,
              currentState: 0,
              visited: [0],
            });
          }
          return;
        }

        if (data.type === "BEST_MOVE_RESULT") {
          const move = data.move as number;
          /* Small delay so the player sees their move before the bot responds. */
          setTimeout(() => applyBotMoveRef.current(move), BOT_DELAY_MS);
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

  /** GameOver → Config (or back to Gauntlet in gauntlet mode) */
  const handlePlayAgain = useCallback(() => {
    playButtonClickSound();
    if (gauntletMode && gauntletStage !== null && gauntletParticipantId && winner) {
      setParticipantStageResult(gauntletParticipantId, gauntletStage, winner === "Player" ? "completed_win" : "completed_loss");
      router.push("/gauntlet");
      return;
    }
    setPhase("config");
    setWinner(null);
    strategyRef.current = null;
  }, [gauntletMode, gauntletStage, gauntletParticipantId, winner, router]);

  const handleSurrender = useCallback(() => {
    if (phase !== "playing") return;
    surrenderedRef.current = true;
    playButtonClickSound();
    triggerGameEnd("Bot");
  }, [phase, triggerGameEnd]);

  /* ---- Gauntlet mode: auto-start the game on mount ---- */
  useEffect(() => {
    if (gauntletMode && gauntletM !== null && gauntletN !== null) {
      handleStart(gauntletM, gauntletN, !gauntletBotFirst);
    }
  }, [gauntletMode, gauntletM, gauntletN, gauntletBotFirst, handleStart]);

  /* ================================================================ */
  /*  Error flash helper                                               */
  /* ================================================================ */

  const flashError = useCallback((bulbIdx: number, confState?: number) => {
    clearTimeout(errorTimer.current);
    clearTimeout(flashTimer.current);

    setErrorBulb(bulbIdx);
    setScreenFlash(true);

    if (confState !== undefined) {
      setHighlightState(confState);
      setTimeout(() => setHighlightState(null), 1000);
    }

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
      if (countSetBits(nextState) > n) {
        flashError(bulbIdx);
        return;
      }
      if (visitedRef.current.has(nextState)) {
        flashError(bulbIdx, nextState);
        return;
      }

      /* ---- Apply player move ---- */
      lastMoveIdx.current = bulbIdx;
      visitedRef.current.add(nextState);
      setVisitedArr((prev) => [...prev, nextState]);
      boardRef.current = nextState;
      setCurrentBoard(nextState);
      setIsPlayerTurn(false);

      console.log(`[PLAYER] ${board.toString(2).padStart(m, '0')} → ${nextState.toString(2).padStart(m, '0')} (bulb ${bulbIdx})`);

      /* ---- Check if bot has any moves ---- */
      const botMoves = getValidMoves(nextState, m, n, visitedRef.current);

      if (botMoves.length === 0) {
        console.log(`[GAME] Bot has NO valid moves → PLAYER WINS`);
        triggerGameEnd("Player");
        return;
      }

      /* ---- Ask the worker for the optimal move ---- */
      const visited = Array.from(visitedRef.current);
      workerRef.current?.postMessage({
        type: "BEST_MOVE",
        m,
        n,
        currentState: nextState,
        visited,
      });
    },
    [isPlayerTurn, phase, m, n, flashError, triggerGameEnd]
  );

  /* ================================================================ */
  /*  Handle worker responses (including bot moves)                    */
  /* ================================================================ */

  const applyBotMove = useCallback(
    (botMove: number) => {
      if (botMove === NO_MOVE) {
        console.log(`[GAME] Bot has NO optimal move → PLAYER WINS`);
        triggerGameEnd("Player");
        return;
      }

      console.log(`[BOT] plays → ${botMove.toString(2).padStart(m, '0')}`);
      
      // Calculate which bit changed
      const changedBit = Math.log2(boardRef.current ^ botMove);
      lastMoveIdx.current = changedBit;

      visitedRef.current.add(botMove);
      setVisitedArr((prev) => [...prev, botMove]);
      boardRef.current = botMove;
      setCurrentBoard(botMove);
      setIsPlayerTurn(true);

      const playerMoves = getValidMoves(botMove, m, n, visitedRef.current);
      console.log(`[GAME] Player has ${playerMoves.length} valid moves`);
      if (playerMoves.length === 0) {
        triggerGameEnd("Bot");
      }
    },
    [m, n, triggerGameEnd]
  );

  /* Keep the ref in sync so the worker onmessage closure never goes stale. */
  applyBotMoveRef.current = applyBotMove;

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center min-h-screen overflow-hidden text-zinc-100">
      {/* ---- Ambient background glow ---- */}
      <div
        className="pointer-events-none fixed inset-0 z-0 scale-105"
        style={{
          backgroundImage: "url('/bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(4px)",
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
            className="fixed inset-0 z-50 pointer-events-none bg-red-500/20"
          />
        )}
      </AnimatePresence>

      {/* ---- Visited States Sidebar (Desktop) ---- */}
      <AnimatePresence>
        {(phase === "playing" || phase === "ending") && (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <VisitedPanel m={m} visitedStates={visitedArr} highlightState={highlightState} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Return to Arena Button ---- */}
      <AnimatePresence>
        {(phase === "landing" || phase === "config") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed top-6 left-6 z-[60]"
          >
            <Link 
              href={gauntletMode ? "/gauntlet" : "/"}
              className="p-3 text-zinc-400 hover:text-zinc-700 transition-all duration-300 flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Phase content ---- */}
      <main
        className={[
          "relative flex flex-col items-center justify-center min-h-screen w-full px-4 py-8",
          "transition-all duration-700 ease-in-out",
          (phase === "playing" || phase === "ending") ? "pb-24 xl:pb-0 xl:pr-80" : "",
        ].join(" ")}
      >
        <AnimatePresence mode="wait">
          {/* ============ LANDING ============ */}
          {phase === "landing" && (
            <motion.div
              key="landing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5 }}
              className="fixed inset-0 w-full h-full flex flex-col items-center justify-center bg-transparent z-50"
            >
              <div
                onClick={handleTap}
                className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-6 group cursor-pointer bg-transparent"
              >
                {/* Floating bulb icon */}
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="w-32 h-32 flex items-center justify-center"
                >
                  <img src="/icons/lamp_on.png" alt="Lamp" className="w-full h-full object-contain pb-1" />
                </motion.div>

                <div className="text-center space-y-2 drop-shadow-md">
                  <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
                    Lamp Game
                  </h1>
                  <p className="text-sm text-zinc-300 group-hover:text-white transition-colors mt-5">
                    Tap or press Enter to Play
                  </p>
                </div>
              </div>
            </motion.div>
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
              <Configuration initialM={m} initialN={n} onStart={handleStart} />
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
                className="w-10 h-10 rounded-full border-2 border-zinc-300 border-t-amber-500"
              />
              <div className="text-center space-y-1 drop-shadow-md">
                <p className="text-sm font-medium text-white">
                  Computing Game Graph…
                </p>
                <p className="text-xs text-zinc-300">
                  Building {(1 << m).toLocaleString()} states via Hopcroft-Karp
                </p>
              </div>
            </motion.div>
          )}

          {/* ============ PLAYING / ENDING ============ */}
          {(phase === "playing" || phase === "ending") && (
            <motion.div
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center gap-8"
            >
              {/* Status bar */}
              <div className="text-center space-y-1 drop-shadow-md">
                <p className="text-xs uppercase tracking-widest text-zinc-300">
                  {phase === "ending"
                    ? "Game Over"
                    : isPlayerTurn
                    ? "Your Turn"
                    : "Bot is thinking…"}
                </p>
                <p className="text-[11px] text-zinc-200 tabular-nums">
                  Moves played: {visitedRef.current.size - 1} ·{" "}
                  Bulbs ON: {countSetBits(currentBoard)}/{n}
                </p>
              </div>

              {/* Board */}
              <GameBoard
                m={m}
                currentBoard={currentBoard}
                errorBulb={errorBulb}
                disabled={!isPlayerTurn || phase === "ending"}
                onLampClick={handleLampClick}
              />

              {/* Subtle hint */}
              <div className="flex flex-col items-center gap-4">
                <p className="text-[10px] text-zinc-300 max-w-xs text-center">
                  Toggle a bulb. No state may repeat; at most {n} bulb
                  {n !== 1 ? "s" : ""} may glow at once.
                </p>

                <button
                  disabled={phase !== "playing"}
                  onClick={handleSurrender}
                  className={[
                    "px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                    phase === "playing"
                      ? "border border-red-500/30 text-red-400/80 hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-400 cursor-pointer"
                      : "border border-zinc-700/30 text-zinc-600/50 cursor-not-allowed opacity-50",
                  ].join(" ")}
                >
                  Surrender
                </button>
              </div>
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
                          "0 0 30px 8px rgba(34,197,94,0.1)",
                          "0 0 50px 16px rgba(34,197,94,0.2)",
                          "0 0 30px 8px rgba(34,197,94,0.1)",
                        ]
                      : [
                          "0 0 30px 8px rgba(239,68,68,0.1)",
                          "0 0 50px 16px rgba(239,68,68,0.2)",
                          "0 0 30px 8px rgba(239,68,68,0.1)",
                        ],
                }}
                transition={{ duration: 2, repeat: Infinity }}
                className={[
                  "w-36 h-36 rounded-full flex items-center justify-center",
                  "border-2",
                  winner === "Player"
                    ? "border-emerald-400/50 bg-emerald-50"
                    : "border-red-400/50 bg-red-50",
                ].join(" ")}
              >
                <img src={winner === "Player" ? "/icons/win_icon.png" : "/icons/lose_icon.png"} alt={winner === "Player" ? "Win" : "Lose"} className="w-32 h-32 object-contain" />
              </motion.div>

              <div className="space-y-2">
                <h2
                  className={[
                    "text-3xl sm:text-4xl font-bold tracking-tight",
                    winner === "Player" ? "text-emerald-600" : "text-red-500",
                  ].join(" ")}
                >
                  {winner === "Player" ? "You Win!" : "Game Over"}
                </h2>
                <p className="text-sm text-zinc-300">
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
                  "px-8 py-3 rounded-full text-sm font-semibold tracking-wide cursor-pointer",
                  "bg-white text-zinc-700 border border-zinc-200 shadow-sm",
                  "hover:bg-zinc-50 transition-colors duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                ].join(" ")}
              >
                {gauntletMode ? "Back to Gauntlet" : "Play Again"}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-transparent" />}>
      <LampGameInner />
    </Suspense>
  );
}
