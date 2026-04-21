const fs = require('fs');

function countSetBits(state) {
  let count = 0;
  let s = state;
  while (s) {
    s &= s - 1;
    count++;
  }
  return count;
}

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

function theoretical_winner(m, n) {
  if (n % 2 !== 0) return 1;
  if (n % 2 === 0 && n < m) return 2;
  if (n % 2 === 0 && n === m) return 1;
  return -1;
}

// simulate_optimal_game returns true if 'player_turn' wins playing optimally against optimal
function simulate_optimal_game(m, n, current_state, initial_visited, current_turn) {
  const visited = new Set(initial_visited);
  let state = current_state;
  let turn = current_turn;
  
  while (true) {
    const validNodes = [];
    validNodes.push(state);
    const limit = 1 << m;
    for (let x = 0; x < limit; x++) {
      if (countSetBits(x) <= n && !visited.has(x)) validNodes.push(x);
    }
    
    const adj = new Map();
    for (const x of validNodes) adj.set(x, []);
    
    const validSet = new Set(validNodes);
    for (const x of validNodes) {
      for (let i = 0; i < m; i++) {
        const y = x ^ (1 << i);
        if (validSet.has(y)) adj.get(x).push(y);
      }
    }
    
    const valid_moves = adj.get(state);
    if (valid_moves.length === 0) {
      return turn === 0 ? 2 : 1;
    }
    
    const pairU = hopcroftKarp(validNodes, adj);
    let matchedPartner = -1;
    if (countSetBits(state) % 2 === 0) {
      matchedPartner = pairU.get(state);
    } else {
      for (const [u, v] of pairU.entries()) {
        if (v === state) {
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
    state = best_move;
    turn = 1 - turn;
  }
}

// Explore game tree using DFS to find a path where W makes a blunder and B wins.
function find_blunder_path(m, n) {
  const expected_winner = theoretical_winner(m, n);
  const W_turn = expected_winner === 1 ? 0 : 1;
  const B_turn = 1 - W_turn;
  
  // DFS to find a blunder path
  // Returns { found: true, bot_stole_win: true } if we can simulate W blundering and B winning
  
  function dfs(state, visited, turn, has_blundered) {
    const validNodes = [];
    validNodes.push(state);
    const limit = 1 << m;
    for (let x = 0; x < limit; x++) {
      if (countSetBits(x) <= n && !visited.has(x)) validNodes.push(x);
    }
    
    const adj = new Map();
    for (const x of validNodes) adj.set(x, []);
    const validSet = new Set(validNodes);
    for (const x of validNodes) {
      for (let i = 0; i < m; i++) {
        const y = x ^ (1 << i);
        if (validSet.has(y)) adj.get(x).push(y);
      }
    }
    
    const valid_moves = adj.get(state);
    if (valid_moves.length === 0) {
      const actual_winner = turn === 0 ? 2 : 1;
      // We are looking for a path where B wins because of a blunder!
      if (has_blundered && actual_winner !== expected_winner) {
        return { found: true, bot_stole_win: true };
      }
      return { found: false };
    }
    
    if (turn === W_turn && !has_blundered) {
      // W tries all moves
      for (const move of valid_moves) {
        const sim_visited = new Set(visited);
        sim_visited.add(move);
        const sim_winner = simulate_optimal_game(m, n, move, sim_visited, 1 - turn);
        
        if (sim_winner !== expected_winner) {
          // This move IS a blunder! W hands the win to B.
          // Let's force W to take this blunder.
          // Then let B play optimally to ensure B actually wins.
          const new_visited = new Set(visited);
          new_visited.add(move);
          const res = dfs(move, new_visited, 1 - turn, true);
          if (res.found) return res;
        } else {
          // Not a blunder. W can try wandering randomly to see if a blunder appears LATER.
          const new_visited = new Set(visited);
          new_visited.add(move);
          const res = dfs(move, new_visited, 1 - turn, false);
          if (res.found) return res;
        }
      }
      return { found: false };
    } 
    else {
      // It is either B's turn, OR W has already blundered so BOTH play optimally now.
      // They both use HK logic.
      const pairU = hopcroftKarp(validNodes, adj);
      let matchedPartner = -1;
      if (countSetBits(state) % 2 === 0) {
        matchedPartner = pairU.get(state);
      } else {
        for (const [u, v] of pairU.entries()) {
          if (v === state) {
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
      
      const new_visited = new Set(visited);
      new_visited.add(best_move);
      return dfs(best_move, new_visited, 1 - turn, has_blundered);
    }
  }

  const initial_visited = new Set([0]);
  return dfs(0, initial_visited, 0, false);
}

function verify_all() {
  console.log("m   | n   | Orig Winner| Blunder Exists? | Bot Steals Win?");
  console.log("----------------------------------------------------------");
  
  for (let m = 1; m <= 6; m++) {
    for (let n = 1; n <= m; n++) {
      if (n > 7) continue;
      
      const expected_winner = theoretical_winner(m, n);
      
      const res = find_blunder_path(m, n);
      const blunder_exists = res.found;
      const bot_stole = res.bot_stole_win ? "YES" : "NO (No Blunder Possible)";
      
      console.log(`${m.toString().padEnd(3)} | ${n.toString().padEnd(3)} | ${expected_winner === 1 ? "1st" : "2nd"}`.padEnd(23) + `| ${blunder_exists ? "YES" : "NO"}`.padEnd(18) + `| ${bot_stole}`);
    }
  }
}

verify_all();
