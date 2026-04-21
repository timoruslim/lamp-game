/**
 * Standalone minimax verification for small (m, n) values.
 * Run with: node verify_minimax.js
 *
 * For each (m, n), determines who wins with perfect play from state 0.
 */

function popcount(x) {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}

/**
 * Pure backtracking minimax. Returns true if the current mover can WIN.
 */
function canCurrentMoverWin(state, m, n, visited) {
  for (let bit = 0; bit < m; bit++) {
    const nb = state ^ (1 << bit);
    if (popcount(nb) > n) continue;
    if (visited[nb]) continue;

    visited[nb] = 1;
    const opponentWins = canCurrentMoverWin(nb, m, n, visited);
    visited[nb] = 0;

    if (!opponentWins) {
      return true; // found a move where opponent loses
    }
  }
  return false; // no moves or all moves let opponent win
}

console.log("Verifying who wins (Player 1 = first mover) for various (m, n):\n");
console.log("m  n  | P1 can win? | Total valid states");
console.log("------|-------------|-------------------");

for (let m = 1; m <= 8; m++) {
  for (let n = 1; n <= m; n++) {
    const total = 1 << m;
    let validCount = 0;
    for (let s = 0; s < total; s++) {
      if (popcount(s) <= n) validCount++;
    }

    const visited = new Uint8Array(total);
    visited[0] = 1; // state 0 is starting position
    const p1wins = canCurrentMoverWin(0, m, n, visited);

    console.log(`${m}  ${n}  | ${p1wins ? "YES (P1)" : "NO  (P2)"}     | ${validCount}`);
  }
}
