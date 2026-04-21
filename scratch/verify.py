import networkx as nx
import sys

def popcount(x):
    return bin(x).count('1')

def get_valid_nodes(m, n, visited):
    return [x for x in range(1 << m) if popcount(x) <= n and x not in visited]

def get_edges(valid_nodes, m):
    edges = []
    valid_set = set(valid_nodes)
    for x in valid_nodes:
        for i in range(m):
            y = x ^ (1 << i)
            if y in valid_set and x < y:
                edges.append((x, y))
    return edges

def play_game(m, n):
    # Simulate a game where BOTH players use the residual Hopcroft-Karp algorithm.
    visited = set()
    current_state = 0
    visited.add(current_state)
    
    # turn = 0 means 1st player is about to move
    # turn = 1 means 2nd player is about to move
    turn = 0 
    
    while True:
        # The player whose turn it is needs to make a move.
        # They look at the residual graph, which includes the current_state and all unvisited states.
        residual_nodes = [current_state] + [x for x in range(1 << m) if popcount(x) <= n and x not in visited]
        
        G = nx.Graph()
        G.add_nodes_from(residual_nodes)
        
        residual_set = set(residual_nodes)
        for x in residual_nodes:
            for i in range(m):
                y = x ^ (1 << i)
                if y in residual_set and x < y:
                    G.add_edge(x, y)
        
        top_nodes = [x for x in residual_nodes if popcount(x) % 2 == 0]
        
        # If the graph has no edges from current_state, player loses
        valid_moves = [y for y in G.neighbors(current_state)]
        if not valid_moves:
            # Player has no valid moves, so the OTHER player wins
            return 2 if turn == 0 else 1
            
        M = nx.bipartite.maximum_matching(G, top_nodes=top_nodes)
        
        if current_state in M:
            # We are matched. Move to the matching partner.
            best_move = M[current_state]
        else:
            # We are not matched. We are in a losing position. Just pick the first valid move.
            best_move = valid_moves[0]
            
        # Make the move
        visited.add(best_move)
        current_state = best_move
        turn = 1 - turn

def theoretical_winner(m, n):
    if n % 2 != 0:
        return 1
    if n % 2 == 0 and n < m:
        return 2
    if n % 2 == 0 and n == m:
        return 1
    return -1

def verify_all():
    print(f"{'m':<3} | {'n':<3} | {'Expected':<10} | {'Simulated':<10} | {'Match?':<6}")
    print("-" * 45)
    all_match = True
    for m in range(1, 9):
        for n in range(1, m + 1):
            if n > 7: 
                continue
            
            sim_winner = play_game(m, n)
            exp_winner = theoretical_winner(m, n)
            
            match = (sim_winner == exp_winner)
            if not match:
                all_match = False
                
            sim_str = "1st" if sim_winner == 1 else "2nd"
            exp_str = "1st" if exp_winner == 1 else "2nd"
            
            print(f"{m:<3} | {n:<3} | {exp_str:<10} | {sim_str:<10} | {str(match):<6}")
            
    if all_match:
        print("\nSUCCESS: All simulated games perfectly match the theoretical table!")
    else:
        print("\nFAILURE: Some simulated games did not match the theoretical table.")

if __name__ == '__main__':
    verify_all()
