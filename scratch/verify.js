const fs = require('fs');

// Bitwise helpers
function countSetBits(state) {
  let count = 0;
  let s = state;
  while (s) {
    s &= s - 1;
    count++;
  }
  return count;
}

// Hopcroft-Karp algorithm in JS
function hopcroftKarp(V, adj) {
  const pairU = new Map();
  const pairV = new Map();
  const dist = new Map();
  
  for (const u of V) {
    if (countSetBits(u) % 2 === 0) {
      pairU.set(u, -1);
    } else {
      pairV.set(u, -1);
    }
  }

  const U = V.filter(u => countSetBits(u) % 2 === 0);

  function bfs() {
    const q = [];
    for (const u of U) {
      if (pairU.get(u) === -1) {
        dist.set(u, 0);
        q.push(u);
      } else {
        dist.set(u, Infinity);
      }
    }
    
    dist.set(-1, Infinity);
    let head = 0;
    while (head < q.length) {
      const u = q[head++];
      if (dist.get(u) < dist.get(-1)) {
        const neighbors = adj.get(u) || [];
        for (const v of neighbors) {
          const pu = pairV.get(v);
          if (dist.get(pu) === Infinity) {
            dist.set(pu, dist.get(u) + 1);
            q.push(pu);
          }
        }
      }
    }
    return dist.get(-1) !== Infinity;
  }

  function dfs(u) {
    if (u !== -1) {
      const neighbors = adj.get(u) || [];
      for (const v of neighbors) {
        const pu = pairV.get(v);
        if (dist.get(pu) === dist.get(u) + 1) {
          if (dfs(pu)) {
            pairV.set(v, u);
            pairU.set(u, v);
            return true;
          }
        }
      }
      dist.set(u, Infinity);
      return false;
    }
    return true;
  }

  let matching = 0;
  while (bfs()) {
    for (const u of U) {
      if (pairU.get(u) === -1) {
        if (dfs(u)) {
          matching++;
        }
      }
    }
  }
  return pairU;
}

function play_game(m, n) {
  const visited = new Set();
  let current_state = 0;
  visited.add(current_state);
  
  let turn = 0; // 0 = 1st player, 1 = 2nd player
  
  while (true) {
    // Residual graph
    const validNodes = [];
    validNodes.push(current_state);
    const limit = 1 << m;
    for (let x = 0; x < limit; x++) {
      if (countSetBits(x) <= n && !visited.has(x)) {
        validNodes.push(x);
      }
    }
    
    const adj = new Map();
    for (const x of validNodes) {
      adj.set(x, []);
    }
    
    const validSet = new Set(validNodes);
    for (const x of validNodes) {
      for (let i = 0; i < m; i++) {
        const y = x ^ (1 << i);
        if (validSet.has(y)) {
          adj.get(x).push(y);
        }
      }
    }
    
    const valid_moves = adj.get(current_state);
    if (valid_moves.length === 0) {
      return turn === 0 ? 2 : 1;
    }
    
    const pairU = hopcroftKarp(validNodes, adj);
    
    // Is current_state matched?
    let matchedPartner = -1;
    if (countSetBits(current_state) % 2 === 0) {
      matchedPartner = pairU.get(current_state);
    } else {
      // current_state is in V, find it in pairU values
      for (const [u, v] of pairU.entries()) {
        if (v === current_state) {
          matchedPartner = u;
          break;
        }
      }
    }
    
    let best_move;
    if (matchedPartner !== -1 && matchedPartner !== undefined) {
      best_move = matchedPartner;
    } else {
      best_move = valid_moves[0];
    }
    
    visited.add(best_move);
    current_state = best_move;
    turn = 1 - turn;
  }
}

function theoretical_winner(m, n) {
  if (n % 2 !== 0) return 1;
  if (n % 2 === 0 && n < m) return 2;
  if (n % 2 === 0 && n === m) return 1;
  return -1;
}

function verify_all() {
  console.log("m   | n   | Expected   | Simulated  | Match?");
  console.log("----------------------------------------------");
  let all_match = true;
  
  for (let m = 1; m <= 8; m++) {
    for (let n = 1; n <= m; n++) {
      if (n > 7) continue;
      
      const sim_winner = play_game(m, n);
      const exp_winner = theoretical_winner(m, n);
      
      const match = sim_winner === exp_winner;
      if (!match) all_match = false;
      
      const sim_str = sim_winner === 1 ? "1st" : "2nd";
      const exp_str = exp_winner === 1 ? "1st" : "2nd";
      
      console.log(`${m.toString().padEnd(3)} | ${n.toString().padEnd(3)} | ${exp_str.padEnd(10)} | ${sim_str.padEnd(10)} | ${match}`);
    }
  }
  
  if (all_match) {
    console.log("\nSUCCESS: All simulated games perfectly match the theoretical table!");
  } else {
    console.log("\nFAILURE: Some simulated games did not match the theoretical table.");
  }
}

verify_all();
