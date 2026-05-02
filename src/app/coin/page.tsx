"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { setParticipantStageResult } from "@/src/lib/gauntletStorage";
import {
  playButtonClickSound,
  playWinDetectedSound,
  playLoseDetectedSound,
  playFlickerSound,
  playCoinSound,
} from "@/src/lib/audioUtils";

type Phase = "intro" | "config" | "playing" | "ending" | "gameover";
type Winner = "Player" | "Bot";
type CellState = 0 | 1 | 2; // 0: empty, 1: coin, 2: forbidden

const applyMoveToBoard = (idx: number, prevBoard: CellState[], n: number, m: number) => {
  const newBoard = [...prevBoard];
  newBoard[idx] = 1; // Coin
  const r = Math.floor(idx / m);
  const c = idx % m;
  if (r > 0 && newBoard[(r - 1) * m + c] === 0) newBoard[(r - 1) * m + c] = 2;
  if (r < n - 1 && newBoard[(r + 1) * m + c] === 0) newBoard[(r + 1) * m + c] = 2;
  if (c > 0 && newBoard[r * m + (c - 1)] === 0) newBoard[r * m + (c - 1)] = 2;
  if (c < m - 1 && newBoard[r * m + (c + 1)] === 0) newBoard[r * m + (c + 1)] = 2;
  return newBoard;
};

const computeMask = (currentBoard: CellState[]) => {
  let mask = 0n;
  for (let i = 0; i < currentBoard.length; i++) {
    if (currentBoard[i] === 0) {
      mask |= 1n << BigInt(i);
    }
  }
  return mask;
};

function SliderRow({ label, symbol, value, min, max, onChange }: { label: string; symbol: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2 w-full">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-zinc-300">
          {label} <span className="text-zinc-500 font-normal italic">({symbol})</span>
        </label>
        <span className="text-lg font-bold tabular-nums text-amber-500">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={[
          "w-full h-1.5 rounded-full appearance-none cursor-pointer",
          "bg-white/10",
          "[&::-webkit-slider-thumb]:appearance-none",
          "[&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4",
          "[&::-webkit-slider-thumb]:rounded-full",
          "[&::-webkit-slider-thumb]:bg-amber-500",
          "[&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(245,158,11,0.4)]",
          "[&::-webkit-slider-thumb]:transition-transform",
          "[&::-webkit-slider-thumb]:hover:scale-125",
          "[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4",
          "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0",
          "[&::-moz-range-thumb]:bg-amber-500",
          "[&::-moz-range-thumb]:shadow-[0_0_8px_rgba(245,158,11,0.4)]",
        ].join(" ")}
      />
      <div className="flex justify-between px-0.5">
        <span className="text-[10px] text-zinc-500">{min}</span>
        <span className="text-[10px] text-zinc-500">{max}</span>
      </div>
    </div>
  );
}

function CoinGameInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  /* ---- Gauntlet mode detection ---- */
  const gauntletMode = searchParams.get("gauntletMode") === "true";
  const gauntletStage = searchParams.get("gauntletStage") ? Number(searchParams.get("gauntletStage")) : null;
  const gauntletN = searchParams.get("n") ? Number(searchParams.get("n")) : null;
  const gauntletM = searchParams.get("m") ? Number(searchParams.get("m")) : null;
  const gauntletBotFirst = searchParams.get("botFirst") === "true";
  const gauntletParticipantId = searchParams.get("participantId") ?? "";

  const [phase, setPhase] = useState<Phase>(gauntletMode ? "config" : "intro");
  const [n, setN] = useState(gauntletN ?? 10);
  const [m, setM] = useState(gauntletM ?? 10);
  const [userIsFirst, setUserIsFirst] = useState(gauntletMode ? !gauntletBotFirst : true);

  const [board, setBoard] = useState<CellState[]>([]);
  const boardRef = useRef<CellState[]>([]);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [winner, setWinner] = useState<Winner | null>(null);
  const [screenFlash, setScreenFlash] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const applyBotMoveRef = useRef<(move: number) => void>(() => {});
  const gauntletAutoStarted = useRef(false);
  const surrenderedRef = useRef(false);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const handleTap = useCallback(() => {
    if (phase === "intro") {
      playButtonClickSound();
      setPhase("config");
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "intro") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") handleTap();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, handleTap]);

  useEffect(() => {
    if (phase !== "ending" || winner === null) return;

    let isMounted = true;
    const runEndingSequence = async () => {
      // 1. Wait a moment like the lamp game (skip if surrendered)
      if (!surrenderedRef.current) {
        await new Promise((r) => setTimeout(r, 900));
      }
      if (!isMounted) return;

      // 2. Play win/lose sound
      if (winner === "Player") {
        playWinDetectedSound();
      } else {
        playLoseDetectedSound();
      }

      await new Promise((r) => setTimeout(r, 400));
      if (!isMounted) return;

      // 3. Collect all coins
      const coins: number[] = [];
      boardRef.current.forEach((cell, i) => {
        if (cell === 1) coins.push(i);
      });

      // Sort: if user wins, collect towards bottom (higher index). So sort descending.
      // If bot wins, collect towards top (lower index). Sort ascending.
      if (winner === "Player") {
        coins.sort((a, b) => b - a);
      } else {
        coins.sort((a, b) => a - b);
      }

      const N = coins.length;
      const T = Math.min(1000, N * 150);

      for (let i = 0; i < N; i++) {
        if (!isMounted) return;
        const idx = coins[i];
        setBoard((prev) => {
          const next = [...prev];
          next[idx] = 0; // Remove coin
          boardRef.current = next;
          return next;
        });
        playCoinSound();

        // Calculate accelerating delay using a cubic curve
        const p1 = 1 - i / N;
        const p2 = 1 - (i + 1) / N;
        const delay = T * (Math.pow(p1, 3) - Math.pow(p2, 3));
        
        await new Promise((r) => setTimeout(r, Math.max(15, delay)));
      }

      await new Promise((r) => setTimeout(r, 500));
      if (!isMounted) return;

      setPhase("gameover");
    };

    runEndingSequence();

    return () => {
      isMounted = false;
    };
  }, [phase, winner]);

  const checkWinCondition = useCallback((mask: bigint, lastPlayer: Winner) => {
    if (mask === 0n) {
      setWinner(lastPlayer);
      setPhase("ending");
      return true;
    }
    return false;
  }, []);

  const applyBotMove = useCallback(
    (move: number) => {
      if (move === -1) {
        setWinner("Player");
        setPhase("ending");
        return;
      }
      playCoinSound();

      setBoard((prev) => {
        const newBoard = applyMoveToBoard(move, prev, n, m);
        boardRef.current = newBoard;
        const newMask = computeMask(newBoard);

        if (!checkWinCondition(newMask, "Bot")) {
          setIsPlayerTurn(true);
        }
        return newBoard;
      });
    },
    [n, m, checkWinCondition]
  );

  applyBotMoveRef.current = applyBotMove;

  const handleStart = () => {
    playButtonClickSound();
    const total = n * m;
    setBoard((prev) => {
      const total = n * m;
      const initial = new Array(total).fill(0);
      boardRef.current = initial;
      return initial;
    });
    setPhase("playing");
    setIsPlayerTurn(false);
    setWinner(null);
    surrenderedRef.current = false;

    workerRef.current?.terminate();
    const worker = new Worker(new URL("@/src/workers/coin.worker.ts", import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, move, message } = e.data;
      if (type === "READY") {
        worker.postMessage({ type: "INIT", n, m, botFirst: !userIsFirst });
      } else if (type === "INIT_DONE") {
        if (!userIsFirst) {
          const initialMask = (1n << BigInt(total)) - 1n;
          worker.postMessage({ type: "BEST_MOVE", stateMask: initialMask, n, m, lastHumanMove: -1 });
        } else {
          setIsPlayerTurn(true);
        }
      } else if (type === "BEST_MOVE_RESULT") {
        setTimeout(() => applyBotMoveRef.current(move), 400);
      } else if (type === "ERROR") {
        console.error("[coin.worker] Error:", message);
      }
    };
  };

  const handleCellClick = (idx: number) => {
    if (!isPlayerTurn || phase !== "playing") return;
    if (board[idx] !== 0) {
      setScreenFlash(true);
      setTimeout(() => setScreenFlash(false), 300);
      playFlickerSound();
      return;
    }

    playCoinSound();
    const newBoard = applyMoveToBoard(idx, board, n, m);
    boardRef.current = newBoard;
    setBoard(newBoard);
    setIsPlayerTurn(false);

    const newMask = computeMask(newBoard);
    if (!checkWinCondition(newMask, "Player")) {
      workerRef.current?.postMessage({ type: "BEST_MOVE", stateMask: newMask, n, m, lastHumanMove: idx });
    }
  };

  const handlePlayAgain = () => {
    playButtonClickSound();
    if (gauntletMode && gauntletStage !== null && gauntletParticipantId && winner) {
      setParticipantStageResult(gauntletParticipantId, gauntletStage, winner === "Player" ? "completed_win" : "completed_loss");
      router.push("/gauntlet");
      return;
    }
    setPhase("config");
    setWinner(null);
  };

  const handleSurrender = useCallback(() => {
    if (phase !== "playing") return;
    surrenderedRef.current = true;
    playButtonClickSound();
    setWinner("Bot");
    setPhase("ending");
  }, [phase]);

  /* ---- Gauntlet mode: auto-start on mount ---- */
  useEffect(() => {
    if (gauntletMode) {
      handleStart();
    }
  }, [gauntletMode]);

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden text-zinc-100">
      {/* Background glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0 scale-105"
        style={{
          backgroundImage: "url('/bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(4px)",
        }}
      />

      {/* Error Flash */}
      <AnimatePresence>
        {screenFlash && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 pointer-events-none bg-red-500/20"
          />
        )}
      </AnimatePresence>

      {/* Return to Arena Button */}
      <AnimatePresence>
        {(phase === "intro" || phase === "config") && (
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

      <main className="relative flex flex-col items-center justify-center min-h-screen w-full px-4 py-8 z-10">
        <AnimatePresence mode="wait">
          {/* ============ INTRO ============ */}
          {phase === "intro" && (
            <motion.div
              key="intro"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5 }}
              className="fixed inset-0 w-full h-full flex flex-col items-center justify-center bg-transparent z-50"
            >
              <div
                onClick={handleTap}
                className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-6 cursor-pointer bg-transparent group"
              >
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-200 to-amber-500 border border-amber-300 flex items-center justify-center shadow-[0_0_30px_5px_rgba(245,158,11,0.2)]"
                >
                  <span className="text-5xl opacity-80 font-serif">$</span>
                </motion.div>
                <div className="text-center space-y-2 drop-shadow-md">
                  <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-white drop-shadow-lg">
                    Coin Game
                  </h1>
                  <p className="text-lg text-zinc-300 group-hover:text-white transition-colors mt-5 font-medium">
                    Click anywhere or press Enter to play
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
              className="flex flex-col items-center justify-center gap-10 w-full max-w-xl mx-auto px-6"
            >
              <div className="text-center space-y-2 drop-shadow-md">
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
                  Configure Game
                </h1>
                <p className="text-sm text-zinc-300 max-w-xs mx-auto leading-relaxed">
                  Choose the grid dimensions for the game.
                </p>
              </div>

              <div className="w-full space-y-8">
                <SliderRow
                  label="Rows"
                  symbol="n"
                  value={n}
                  min={1}
                  max={12}
                  onChange={(v) => setN(v)}
                />
                <SliderRow
                  label="Cols"
                  symbol="m"
                  value={m}
                  min={1}
                  max={12}
                  onChange={(v) => setM(v)}
                />
              </div>

              {/* Visual preview */}
              <div className="w-full">
                <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3 text-center">
                  Preview
                </p>
                <div className="flex items-center justify-center p-4 overflow-hidden mx-auto w-full">
                  <div className="rounded-sm border-[2px] border-[#c4a98a] shadow-md overflow-hidden" style={{ display: "grid", gridTemplateColumns: `repeat(${m}, 1fr)`, gap: "0px", width: `${(m / Math.max(n, m)) * 14}rem`, maxWidth: "14rem" }}>
                    {Array.from({ length: n * m }).map((_, i) => {
                      return (
                        <div
                          key={i}
                          className="aspect-square border-[#c4a98a]/60 border-[0.5px] bg-[#f3ead8]"
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Player Order Toggle */}
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

              <motion.button
                onClick={handleStart}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className={[
                  "relative px-10 py-3.5 rounded-full font-semibold text-sm tracking-wide",
                  "bg-gradient-to-r from-amber-500 to-orange-600",
                  "text-white shadow-lg shadow-amber-500/25 cursor-pointer",
                  "hover:shadow-amber-500/40 transition-shadow duration-300",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                ].join(" ")}
              >
                Start Game
              </motion.button>
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
              <div className="text-center space-y-1 drop-shadow-md">
                <p className="text-xs uppercase tracking-widest text-zinc-200">
                  {phase === "ending" ? "Game Over" : isPlayerTurn ? "Your Turn" : "Bot is thinking…"}
                </p>
                <p className="text-[11px] text-zinc-300 tabular-nums">
                  Coins placed: {board.filter((c) => c === 1).length}
                </p>
              </div>

              <div
                className="bg-white rounded-lg border-[4px] border-[#c4a98a] shadow-xl relative overflow-hidden"
                style={{ 
                  display: "grid", 
                  gridTemplateColumns: `repeat(${m}, minmax(0, 1fr))`, 
                  gap: "0px",
                  width: `calc(min(95vw, ${(m / n) * 72}vh, ${m * 4.5 + 0.75}rem))`
                }}
              >
                {board.map((cellState, i) => {
                  return (
                  <div
                    key={i}
                    onClick={() => handleCellClick(i)}
                    className="@container flex items-center justify-center transition-all cursor-pointer relative overflow-hidden aspect-square border-[#c4a98a]/60 border-[0.5px] bg-[#f3ead8] hover:bg-[#ebe0cb]"
                  >
                    {/* The Coin */}
                    <AnimatePresence>
                      {cellState === 1 && (
                        <motion.div
                          initial={{ y: -500, rotateY: 720, opacity: 0 }}
                          animate={{ y: 0, rotateY: 0, opacity: 1 }}
                          transition={{ type: "spring", damping: 15, stiffness: 100 }}
                          className="w-[75%] h-[75%] rounded-full border-2 border-amber-300 flex items-center justify-center z-10"
                          style={{
                            background: "linear-gradient(135deg, #fef08a 0%, #f59e0b 50%, #b45309 100%)",
                            boxShadow: "0 4px 6px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.5), 0 0 16px 3px rgba(245,158,11,0.4)",
                          }}
                        >
                          <div className="w-[75%] h-[75%] rounded-full border border-amber-600/40 flex items-center justify-center text-amber-950 font-serif text-[clamp(10px,40cqmin,2rem)] leading-none font-bold shadow-inner">
                            $
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  );
                })}
              </div>

              {/* Subtle hint */}
              <div className="flex flex-col items-center gap-4">
                <p className="text-[11px] text-zinc-300 max-w-xs text-center mt-2">
                  Place a coin. Coins cannot be horizontally or vertically adjacent. The last player to move wins.
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
                  "w-36 h-36 rounded-full flex items-center justify-center border-2",
                  winner === "Player" ? "border-emerald-400/50 bg-emerald-50" : "border-red-400/50 bg-red-50",
                ].join(" ")}
              >
                <img src={winner === "Player" ? "/icons/win_icon.png" : "/icons/lose_icon.png"} alt={winner === "Player" ? "Win" : "Lose"} className="w-32 h-32 object-contain" />
              </motion.div>

              <div className="space-y-2">
                <h2
                  className={[
                    "text-4xl sm:text-5xl font-bold tracking-tight",
                    winner === "Player" ? "text-emerald-600" : "text-red-500",
                  ].join(" ")}
                >
                  {winner === "Player" ? "You Win!" : "Game Over"}
                </h2>
                <p className="text-sm text-zinc-300">
                  {winner === "Player"
                    ? "The bot was completely trapped. Brilliant play!"
                    : "No playable squares left for you. The bot wins."}
                </p>
              </div>

              <motion.button
                onClick={handlePlayAgain}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.96 }}
                className="px-8 py-3 rounded-full text-sm font-semibold tracking-wide cursor-pointer bg-white text-zinc-700 border border-zinc-200 shadow-sm hover:bg-zinc-50 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
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

export default function CoinGame() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-transparent" />}>
      <CoinGameInner />
    </Suspense>
  );
}
