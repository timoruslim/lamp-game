/**
 * gameUtils.ts — Shared types and bitwise utilities for the Lamp Game.
 *
 * This module is imported by both the main React thread and the Web Worker,
 * so it must remain free of DOM / browser-specific APIs.
 */

/* ------------------------------------------------------------------ */
/*  Web Worker message protocol                                       */
/* ------------------------------------------------------------------ */

/** Message sent from the main thread → solver worker. */
export interface WorkerRequest {
  type: "COMPUTE";
  m: number; // total number of bulbs  (1 ≤ m ≤ 16)
  n: number; // max bulbs ON at once   (1 ≤ n ≤ m)
}

/** Message sent from the solver worker → main thread. */
export type WorkerResponse =
  | {
      type: "READY";
    }
  | {
      type: "RESULT";
      /** strategy[state] = optimal next state, or 0xFFFF if no winning move. */
      strategy: Uint16Array;
    }
  | {
      type: "ERROR";
      message: string;
    };

/* ------------------------------------------------------------------ */
/*  Game-phase enum                                                    */
/* ------------------------------------------------------------------ */

export const enum GamePhase {
  Landing = "LANDING",
  Config = "CONFIG",
  Loading = "LOADING",
  Playing = "PLAYING",
  GameOver = "GAME_OVER",
}

/* ------------------------------------------------------------------ */
/*  Bitwise helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Toggle a single bit in `state`.
 *
 * @param state   Current bitmask (each bit = one bulb).
 * @param index   0-based bulb index to flip.
 * @returns       New state with the bit at `index` toggled.
 */
export function toggleBit(state: number, index: number): number {
  return state ^ (1 << index);
}

/**
 * Count the number of set bits (1s) in `state`.
 * Uses the Kernighan trick — O(k) where k = number of set bits.
 *
 * @param state  Bitmask to count.
 * @returns      Population count.
 */
export function countSetBits(state: number): number {
  let count = 0;
  let s = state;
  while (s) {
    s &= s - 1; // clear lowest set bit
    count++;
  }
  return count;
}

/**
 * Check whether a specific bit is set.
 *
 * @param state  Bitmask.
 * @param index  0-based bit position.
 * @returns      `true` if the bit at `index` is 1.
 */
export function isBitSet(state: number, index: number): boolean {
  return (state & (1 << index)) !== 0;
}

/**
 * Sentinel value indicating "no winning move" from a state.
 * Matches the C-side `NIL = 0xFFFF`.
 */
export const NO_MOVE: number = 0xffff;

/* ------------------------------------------------------------------ */
/*  Move-validity helpers                                             */
/* ------------------------------------------------------------------ */

/**
 * Determine whether toggling `bulbIndex` from `currentState` is a legal move.
 *
 * A move is legal iff:
 *   1. The resulting state has popcount ≤ maxOn.
 *   2. The resulting state has NOT been visited before.
 *
 * @param currentState  Current bitmask.
 * @param bulbIndex     Bulb to toggle.
 * @param maxOn         Maximum bulbs allowed ON simultaneously (n).
 * @param visited       Set of previously visited states.
 * @returns             `true` if the move is legal.
 */
export function isValidMove(
  currentState: number,
  bulbIndex: number,
  maxOn: number,
  visited: Set<number>
): boolean {
  const next = toggleBit(currentState, bulbIndex);
  if (countSetBits(next) > maxOn) return false;
  if (visited.has(next)) return false;
  return true;
}

/**
 * Enumerate every legal move from `currentState`.
 *
 * @param currentState  Current bitmask.
 * @param m             Total number of bulbs.
 * @param maxOn         Maximum bulbs ON simultaneously.
 * @param visited       Set of previously visited states.
 * @returns             Array of legal next-states.
 */
export function getValidMoves(
  currentState: number,
  m: number,
  maxOn: number,
  visited: Set<number>
): number[] {
  const moves: number[] = [];
  for (let i = 0; i < m; i++) {
    if (isValidMove(currentState, i, maxOn, visited)) {
      moves.push(toggleBit(currentState, i));
    }
  }
  return moves;
}
