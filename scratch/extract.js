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
    if (countSetBits(u) % 2 === 0) pairU.set(u, -1);
    else pairV.set(u, -1);
  }

  const U = V.filter(u => countSetBits(u) % 2 === 0);

  function bfs() {
    const q = [];
    for (const u of U) {
      if (pairU.get(u) === -1) {
        dist.set(u, 0);
        q.push(u);
      } else dist.set(u, Infinity);
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
      if (pairU.get(u) === -1 && dfs(u)) matching++;
    }
  }
  return pairU;
}

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
    if (valid_moves.length === 0) return turn === 0 ? 2 : 1;
    
    const pairU = hopcroftKarp(validNodes, adj);
    let matchedPartner = -1;
    if (countSetBits(state) % 2 === 0) matchedPartner = pairU.get(state);
    else {
      for (const [u, v] of pairU.entries()) {
        if (v === state) { matchedPartner = u; break; }
      }
    }
    
    let best_move = (matchedPartner !== -1 && matchedPartner !== undefined) ? matchedPartner : valid_moves[0];
    visited.add(best_move);
    state = best_move;
    turn = 1 - turn;
  }
}

function format_move(prev, next, m) {
  const diff = prev ^ next;
  const bit = Math.log2(diff);
  const action = (next & diff) ? "ON " : "OFF";
  return `Turn Lamp ${bit + 1} ${action} (State: ${next.toString(2).padStart(m, '0')})`;
}

function find_path(m, n) {
  // Only interested in cases where User (1st) is theoretical winner
  // n is odd, or n == m and n is even
  const W_turn = 0; 
  let found_path = null;

  function dfs(state, visited, turn, path, has_blundered) {
    if (found_path) return;
    
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
      const winner = turn === 0 ? 2 : 1;
      if (has_blundered && winner === 2) {
        found_path = [...path];
      }
      return;
    }
    
    if (turn === W_turn && !has_blundered) {
      // User tries all moves
      for (const move of valid_moves) {
        if (found_path) return;
        const sim_visited = new Set(visited);
        sim_visited.add(move);
        const sim_winner = simulate_optimal_game(m, n, move, sim_visited, 1 - turn);
        
        let p = [...path, { player: 'User', move: move, prev: state, note: sim_winner === 2 ? "BLUNDER!" : "" }];
        const new_visited = new Set(visited);
        new_visited.add(move);
        
        if (sim_winner === 2) {
          dfs(move, new_visited, 1 - turn, p, true);
        } else {
          dfs(move, new_visited, 1 - turn, p, false);
        }
      }
    } else {
      // Bot (or User after blunder) plays optimally
      const pairU = hopcroftKarp(validNodes, adj);
      let matchedPartner = -1;
      if (countSetBits(state) % 2 === 0) matchedPartner = pairU.get(state);
      else {
        for (const [u, v] of pairU.entries()) {
          if (v === state) { matchedPartner = u; break; }
        }
      }
      
      let best_move = (matchedPartner !== -1 && matchedPartner !== undefined) ? matchedPartner : valid_moves[0];
      let p = [...path, { player: turn === 0 ? 'User' : 'Bot', move: best_move, prev: state }];
      const new_visited = new Set(visited);
      new_visited.add(best_move);
      dfs(best_move, new_visited, 1 - turn, p, has_blundered);
    }
  }

  dfs(0, new Set([0]), 0, [], false);
  return found_path;
}

const cases = [
  {m: 3, n: 3},
  {m: 4, n: 3},
  {m: 5, n: 5}
];

for (const c of cases) {
  console.log(`\n=== CASE m=${c.m}, n=${c.n} ===`);
  const path = find_path(c.m, c.n);
  if (path) {
    for (let i = 0; i < path.length; i++) {
      const step = path[i];
      let text = `${(i+1).toString().padStart(2)}. ${step.player.padStart(4)}: ${format_move(step.prev, step.move, c.m)}`;
      if (step.note) text += `  <-- ${step.note}`;
      console.log(text);
    }
    console.log(`Result: Bot Wins!`);
  } else {
    console.log("No path found.");
  }
}
