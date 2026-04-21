/**
 * solver.worker.js — Web Worker: Wasm for initial assessment + JS Hopcroft-Karp per move.
 *
 * COMPUTE    → Wasm compute_strategy for initial win/loss assessment
 * BEST_MOVE  → JS Hopcroft-Karp on the RESIDUAL graph (minus visited states)
 *
 * The residual-graph approach is provably correct:
 *   - If the bot's current state is matched in the residual matching → winning move
 *   - If unmatched → bot is losing, pick any legal move
 *   - Handles blunder detection automatically (P1 blunders → residual matching
 *     may now favor the bot)
 */

var Module = {
  locateFile: function (path) {
    return "/wasm/" + path;
  },
  onRuntimeInitialized: function () {
    self.postMessage({ type: "READY" });
    if (_pendingRequest) {
      var req = _pendingRequest;
      _pendingRequest = null;
      handleMessage(req);
    }
  },
};

var _pendingRequest = null;

importScripts("/wasm/game_solver.js");

/* ================================================================== */
/*  COMPUTE handler — static strategy via Wasm                        */
/* ================================================================== */

function computeStrategy(m, n) {
  try {
    var ptr = Module._compute_strategy(m, n);
    if (ptr === 0) {
      self.postMessage({ type: "ERROR", message: "compute_strategy returned null." });
      return;
    }
    var totalStates = 1 << m;
    var wasmArray = HEAPU16.subarray(ptr / 2, ptr / 2 + totalStates);
    var strategy = new Uint16Array(wasmArray);
    Module._free(ptr);

    console.log("[solver] m=" + m + " n=" + n +
      " | strategy[0]=" + strategy[0] +
      " | " + (strategy[0] === 0xFFFF ? "Bot (P2) should win" : "User (P1) should win"));

    self.postMessage({ type: "RESULT", strategy: strategy }, [strategy.buffer]);
  } catch (err) {
    self.postMessage({ type: "ERROR", message: err.message || String(err) });
  }
}

/* ================================================================== */
/*  JS Hopcroft-Karp on residual graph                                */
/* ================================================================== */

function popcount(x) {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}

/**
 * Build bipartite graph and run Hopcroft-Karp on the residual graph
 * (all valid states minus visited states).
 *
 * Returns: { matchU, matchV, uId, vId, uState, vState, uCount, vCount }
 *   matchU[ui] = vi (or -1)     — U-vertex ui is matched to V-vertex vi
 *   matchV[vi] = ui (or -1)     — V-vertex vi is matched to U-vertex ui
 *   uId[state] = ui (or -1)     — state's U-index
 *   vId[state] = vi (or -1)     — state's V-index
 *   uState[ui] = state          — U-index to state
 *   vState[vi] = state          — V-index to state
 */
function residualHopcroftKarp(m, n, visitedSet) {
  var totalStates = 1 << m;

  /* ---- Classify vertices (excluding visited) ---- */
  var uId = new Int32Array(totalStates).fill(-1);
  var vId = new Int32Array(totalStates).fill(-1);
  var uState = [];
  var vState = [];
  var uCount = 0, vCount = 0;

  for (var s = 0; s < totalStates; s++) {
    var pc = popcount(s);
    if (pc > n) continue;
    if (visitedSet[s]) continue;  /* skip visited states */

    if (pc % 2 === 0) {
      uId[s] = uCount;
      uState[uCount] = s;
      uCount++;
    } else {
      vId[s] = vCount;
      vState[vCount] = s;
      vCount++;
    }
  }

  if (uCount === 0 || vCount === 0) {
    return { matchU: [], matchV: [], uId: uId, vId: vId, uState: uState, vState: vState, uCount: uCount, vCount: vCount };
  }

  /* ---- Build adjacency list (U → V) ---- */
  var adjOffset = new Int32Array(uCount + 1);
  for (var ui = 0; ui < uCount; ui++) {
    var st = uState[ui];
    var deg = 0;
    for (var bit = 0; bit < m; bit++) {
      var nb = st ^ (1 << bit);
      if (vId[nb] !== -1) deg++;
    }
    adjOffset[ui + 1] = adjOffset[ui] + deg;
  }

  var totalEdges = adjOffset[uCount];
  var adjList = new Int32Array(totalEdges);
  var cursor = new Int32Array(adjOffset);

  for (var ui = 0; ui < uCount; ui++) {
    var st = uState[ui];
    for (var bit = 0; bit < m; bit++) {
      var nb = st ^ (1 << bit);
      if (vId[nb] !== -1) {
        adjList[cursor[ui]++] = vId[nb];
      }
    }
  }

  /* ---- Hopcroft-Karp ---- */
  var matchU = new Int32Array(uCount).fill(-1);
  var matchV = new Int32Array(vCount).fill(-1);
  var dist = new Int32Array(uCount);
  var INF = 0x7FFFFFFF;
  var queue = new Int32Array(uCount);

  function hkBfs() {
    var head = 0, tail = 0;
    for (var ui = 0; ui < uCount; ui++) {
      if (matchU[ui] === -1) {
        dist[ui] = 0;
        queue[tail++] = ui;
      } else {
        dist[ui] = INF;
      }
    }
    var found = false;
    while (head < tail) {
      var ui = queue[head++];
      var start = adjOffset[ui], end = adjOffset[ui + 1];
      for (var e = start; e < end; e++) {
        var vi = adjList[e];
        var mu = matchV[vi];
        if (mu === -1) {
          found = true;
        } else if (dist[mu] === INF) {
          dist[mu] = dist[ui] + 1;
          queue[tail++] = mu;
        }
      }
    }
    return found;
  }

  function hkDfs(ui) {
    var start = adjOffset[ui], end = adjOffset[ui + 1];
    for (var e = start; e < end; e++) {
      var vi = adjList[e];
      var mu = matchV[vi];
      if (mu === -1 || (dist[mu] === dist[ui] + 1 && hkDfs(mu))) {
        matchU[ui] = vi;
        matchV[vi] = ui;
        return true;
      }
    }
    dist[ui] = INF;
    return false;
  }

  while (hkBfs()) {
    for (var ui = 0; ui < uCount; ui++) {
      if (matchU[ui] === -1) hkDfs(ui);
    }
  }

  return {
    matchU: matchU, matchV: matchV,
    uId: uId, vId: vId,
    uState: uState, vState: vState,
    uCount: uCount, vCount: vCount
  };
}

/* ================================================================== */
/*  BEST_MOVE handler                                                 */
/* ================================================================== */

function computeBestMove(m, n, currentState, visitedArr) {
  var totalStates = 1 << m;

  /* Build visited bitset — exclude all visited states EXCEPT currentState.
   * The bot is AT currentState and needs to find its matching edge in the
   * residual graph, so currentState must be a vertex in the graph. */
  var visitedSet = new Uint8Array(totalStates);
  for (var i = 0; i < visitedArr.length; i++) {
    visitedSet[visitedArr[i]] = 1;
  }
  /* Keep currentState in the graph */
  visitedSet[currentState] = 0;

  /* Run Hopcroft-Karp on the residual graph */
  var result = residualHopcroftKarp(m, n, visitedSet);

  var pc = popcount(currentState);
  var bestMove = 0xFFFF;

  if (pc % 2 === 0) {
    /* Bot is at a U-vertex (even popcount). Check if it's matched. */
    var ui = result.uId[currentState];
    if (ui !== -1 && result.matchU[ui] !== -1) {
      bestMove = result.vState[result.matchU[ui]];
    }
  } else {
    /* Bot is at a V-vertex (odd popcount). Check if it's matched. */
    var vi = result.vId[currentState];
    if (vi !== -1 && result.matchV[vi] !== -1) {
      bestMove = result.uState[result.matchV[vi]];
    }
  }

  /* Fallback: any legal move */
  if (bestMove === 0xFFFF) {
    for (var bit = 0; bit < m; bit++) {
      var nb = currentState ^ (1 << bit);
      if (popcount(nb) <= n && !visitedSet[nb] && nb !== currentState) {
        bestMove = nb;
        break;
      }
    }
  }

  var isMatched = false;
  if (pc % 2 === 0) {
    var ui2 = result.uId[currentState];
    isMatched = (ui2 !== -1 && result.matchU[ui2] !== -1);
  } else {
    var vi2 = result.vId[currentState];
    isMatched = (vi2 !== -1 && result.matchV[vi2] !== -1);
  }

  console.log("[solver] best_move from " +
    currentState.toString(2).padStart(m, '0') + " → " +
    (bestMove === 0xFFFF ? "NIL (no moves)" : bestMove.toString(2).padStart(m, '0')) +
    (isMatched ? " (WINNING/optimal)" : " (LOSING/fallback)"));

  self.postMessage({ type: "BEST_MOVE_RESULT", move: bestMove });
}

/* ================================================================== */
/*  Message dispatcher                                                */
/* ================================================================== */

function handleMessage(data) {
  if (data.type === "COMPUTE") {
    computeStrategy(data.m, data.n);
  } else if (data.type === "BEST_MOVE") {
    computeBestMove(data.m, data.n, data.currentState, data.visited);
  }
}

self.addEventListener("message", function (event) {
  var data = event.data;
  if (!data) return;

  if (!Module.calledRun) {
    _pendingRequest = data;
    return;
  }

  handleMessage(data);
});
