/**
 * Quick test: m=7, n=3 only. Who wins with perfect play?
 */

function popcount(x) {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}

function canCurrentMoverWin(state, m, n, visited) {
  for (let bit = 0; bit < m; bit++) {
    const nb = state ^ (1 << bit);
    if (popcount(nb) > n) continue;
    if (visited[nb]) continue;
    visited[nb] = 1;
    const oppWins = canCurrentMoverWin(nb, m, n, visited);
    visited[nb] = 0;
    if (!oppWins) return true;
  }
  return false;
}

const m = 7, n = 3;
const total = 1 << m;
let validCount = 0;
for (let s = 0; s < total; s++) if (popcount(s) <= n) validCount++;
console.log(`m=${m}, n=${n}, valid states=${validCount}`);
console.log("Computing...");

const t0 = Date.now();
const visited = new Uint8Array(total);
visited[0] = 1;
const p1wins = canCurrentMoverWin(0, m, n, visited);
console.log(`Player 1 wins: ${p1wins} (took ${Date.now() - t0} ms)`);
