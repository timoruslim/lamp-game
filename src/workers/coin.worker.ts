/// <reference lib="webworker" />

let wasmModule: any = null;

const TIME_LIMIT_MS = 5000;

self.importScripts("/wasm/coin_solver.js");

(self as any).CoinSolver({
  locateFile: (path: string) => {
    if (path.endsWith('.wasm')) return '/wasm/coin_solver.wasm';
    return path;
  }
}).then((instance: any) => {
  wasmModule = instance;
  postMessage({ type: "READY" });
});

/* ---- Mirror Strategy ---- */
let gameN = 0;
let gameM = 0;
let botIsFirst = false;
let useMirror = false;
let mirrorFirstMove = true;

/**
 * Mirror-steal state for odd×odd when bot is second.
 * If the human doesn't play center on move 1, the bot plays center
 * and then mirrors — including mirroring that first non-center move.
 */
let canStealMirror = false;      // true when odd×odd and bot is second

function mirrorIndex(idx: number, n: number, m: number): number {
  const r = Math.floor(idx / m);
  const c = idx % m;
  return (n - 1 - r) * m + (m - 1 - c);
}

function centerIndex(n: number, m: number): number {
  return Math.floor(n / 2) * m + Math.floor(m / 2);
}

/* ---- Heuristic for boards > 64 cells ---- */
function heuristicMove(stateMask: bigint, n: number, m: number): number {
  const total = n * m;
  let bestMove = -1;
  let bestScore = -1;
  for (let i = 0; i < total; i++) {
    if (!(stateMask & (1n << BigInt(i)))) continue;
    const r = Math.floor(i / m);
    const c = i % m;
    let score = 1;
    if (r > 0 && (stateMask & (1n << BigInt((r - 1) * m + c)))) score++;
    if (r < n - 1 && (stateMask & (1n << BigInt((r + 1) * m + c)))) score++;
    if (c > 0 && (stateMask & (1n << BigInt(r * m + (c - 1))))) score++;
    if (c < m - 1 && (stateMask & (1n << BigInt(r * m + (c + 1))))) score++;
    if (score > bestScore) { bestScore = score; bestMove = i; }
  }
  return bestMove;
}

self.onmessage = (e: MessageEvent) => {
  const data = e.data;

  if (data.type === "INIT") {
    if (!wasmModule) {
      postMessage({ type: "ERROR", message: "WASM not loaded yet" });
      return;
    }
    const { n, m, botFirst } = data;
    gameN = n;
    gameM = m;
    botIsFirst = botFirst;
    mirrorFirstMove = true;

    const bothOdd = n % 2 === 1 && m % 2 === 1;

    // ──────────────────────────────────────────────────────────────────
    //  Game theory of Node Kayles on n×m with 180° rotational mirror:
    //
    //  • Both dimensions odd → center cell exists → P1 plays center,
    //    then mirrors every P2 move → P1 always wins.
    //
    //  • At least one dimension even → no center cell → every cell has
    //    a distinct mirror partner → P2 mirrors every P1 move → P2
    //    always wins.
    //
    //  • Even×even (or mixed) with bot as P1 → bot CANNOT win by
    //    mirroring. Its first move has no mirror partner, which creates
    //    an asymmetry that gives the human more available cells. The
    //    solver/heuristic will exploit human mistakes instead.
    // ──────────────────────────────────────────────────────────────────

    // Bot wins with mirror when:
    // - Both odd AND bot is Player 1 (center + mirror)
    // - NOT both odd AND bot is Player 2 (pure mirror — works for
    //   even×even, odd×even, and even×odd grids)
    useMirror = (bothOdd && botFirst) || (!bothOdd && !botFirst);

    // Bot is second on an odd×odd board: can steal mirror if human skips center
    canStealMirror = bothOdd && !botFirst;

    wasmModule.ccall("init_game", null, ["number", "number"], [n, m]);
    postMessage({ type: "INIT_DONE" });
  }
  else if (data.type === "BEST_MOVE") {
    const { stateMask, n, m, lastHumanMove } = data;

    if (typeof stateMask !== "bigint") {
      postMessage({ type: "ERROR", message: "stateMask must be a bigint. Received: " + typeof stateMask });
      return;
    }

    // ---- Mirror-steal: odd×odd, bot is second ----
    // If human's first move is NOT center, bot plays center and then relies on solver.
    if (canStealMirror) {
      canStealMirror = false; // Only attempt steal on the very first turn
      const center = centerIndex(n, m);
      if (lastHumanMove !== center) {
        // Human blundered! Bot steals center.
        if (stateMask & (1n << BigInt(center))) {
          postMessage({ type: "BEST_MOVE_RESULT", move: center });
          return;
        }
      }
    }

    // ---- Standard mirror strategy (guaranteed win, O(1)) ----
    if (useMirror) {
      let move: number;

      if (mirrorFirstMove && botIsFirst) {
        // Both odd, bot is first: play center
        move = centerIndex(n, m);
        mirrorFirstMove = false;
      } else {
        // Mirror the human's last move
        move = mirrorIndex(lastHumanMove, n, m);
        mirrorFirstMove = false;
      }

      // Safety check: if mirror cell is available, use it; otherwise fall through to solver
      if (stateMask & (1n << BigInt(move))) {
        postMessage({ type: "BEST_MOVE_RESULT", move });
        return;
      }
      // Mirror cell unexpectedly blocked — fall through to solver
    }

    // ---- Solver / Heuristic (for losing positions or mixed parity) ----
    if (n * m > 64) {
      const move = heuristicMove(stateMask, n, m);
      postMessage({ type: "BEST_MOVE_RESULT", move });
      return;
    }

    if (!wasmModule) {
      postMessage({ type: "ERROR", message: "WASM not loaded yet" });
      return;
    }

    const stateLow = Number(stateMask & 0xFFFFFFFFn);
    const stateHigh = Number((stateMask >> 32n) & 0xFFFFFFFFn);

    const move = wasmModule.ccall(
      "get_best_move", "number",
      ["number", "number", "number", "number", "number"],
      [stateLow, stateHigh, n, m, TIME_LIMIT_MS]
    );

    postMessage({ type: "BEST_MOVE_RESULT", move });
  }
};
