/**
 * main.c — Combinatorial Light-Bulb Game Solver (Wasm Backend)
 *
 * Given m bulbs and a constraint that at most n may be ON simultaneously,
 * this module builds a bipartite graph of valid game states and computes
 * a maximum matching via Hopcroft-Karp.  The matching defines the perfect-
 * play strategy: strategy[state] = next_state (or 0xFFFF if no winning
 * move exists from that state).
 *
 * Bipartite partition:
 *   Layer U  = states reachable on even turns (0, 2, 4, …)  — popcount EVEN
 *   Layer V  = states reachable on odd  turns (1, 3, 5, …)  — popcount ODD
 *
 * An edge (u, v) exists iff u and v differ by exactly one bit AND both
 * have popcount ≤ n.
 *
 * Exported:  uint16_t *compute_strategy(int m, int n)
 *   Caller frees the returned buffer with free().
 */

#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

/* ------------------------------------------------------------------ */
/*  Portable popcount (works with any compiler)                       */
/* ------------------------------------------------------------------ */

static inline int popcount(uint32_t x) {
    x = x - ((x >> 1) & 0x55555555u);
    x = (x & 0x33333333u) + ((x >> 2) & 0x33333333u);
    return (int)(((x + (x >> 4)) & 0x0F0F0F0Fu) * 0x01010101u >> 24);
}

/* ------------------------------------------------------------------ */
/*  Constants & limits                                                */
/* ------------------------------------------------------------------ */

#define MAX_M       16
#define MAX_STATES  (1 << MAX_M)   /* 65 536 */
#define NIL         0xFFFFu        /* "no match" sentinel              */
#define INF         0x7FFFFFFFu

/* ------------------------------------------------------------------ */
/*  Adjacency list (CSR – Compressed Sparse Row)                      */
/* ------------------------------------------------------------------ */

static uint32_t adj_offset[MAX_STATES + 1]; /* prefix-sum of degrees   */
static uint16_t *adj_list;                  /* flat neighbour array     */

/* ------------------------------------------------------------------ */
/*  Hopcroft-Karp working arrays                                      */
/* ------------------------------------------------------------------ */

static uint16_t match_u[MAX_STATES]; /* match_u[u] = matched v (or NIL) */
static uint16_t match_v[MAX_STATES]; /* match_v[v] = matched u (or NIL) */
static uint32_t dist[MAX_STATES];    /* BFS layers for U vertices       */

/* BFS queue */
static uint16_t queue[MAX_STATES];

/* ------------------------------------------------------------------ */
/*  Vertex classification helpers                                     */
/* ------------------------------------------------------------------ */

/* is_valid[s] = 1 iff popcount(s) <= n */
static uint8_t  is_valid[MAX_STATES];

/* Map from state -> contiguous U or V index and back.                */
static uint16_t u_id[MAX_STATES]; /* state -> U-index (NIL if not in U) */
static uint16_t v_id[MAX_STATES]; /* state -> V-index (NIL if not in V) */
static uint16_t u_state[MAX_STATES]; /* U-index -> state */
static uint16_t v_state[MAX_STATES]; /* V-index -> state */
static uint32_t u_count, v_count;

/* ------------------------------------------------------------------ */
/*  Build the bipartite graph in CSR form                             */
/* ------------------------------------------------------------------ */

static void build_graph(int m, int n) {
    uint32_t total = 1u << m;

    /* ---- classify vertices ---- */
    u_count = v_count = 0;
    memset(u_id, 0xFF, sizeof(u_id));
    memset(v_id, 0xFF, sizeof(v_id));

    for (uint32_t s = 0; s < total; s++) {
        int pc = popcount(s);
        is_valid[s] = (pc <= n) ? 1 : 0;
        if (!is_valid[s]) continue;

        if (pc & 1) {                       /* odd popcount  -> V */
            v_id[s] = (uint16_t)v_count;
            v_state[v_count] = (uint16_t)s;
            v_count++;
        } else {                            /* even popcount -> U */
            u_id[s] = (uint16_t)u_count;
            u_state[u_count] = (uint16_t)s;
            u_count++;
        }
    }

    /* ---- count degrees for U vertices ---- */
    memset(adj_offset, 0, (u_count + 1) * sizeof(uint32_t));

    for (uint32_t ui = 0; ui < u_count; ui++) {
        uint32_t s = u_state[ui];
        uint32_t deg = 0;
        for (int bit = 0; bit < m; bit++) {
            uint32_t nb = s ^ (1u << bit);
            if (is_valid[nb] && v_id[nb] != NIL)
                deg++;
        }
        adj_offset[ui + 1] = deg;
    }

    /* prefix sum */
    for (uint32_t i = 1; i <= u_count; i++)
        adj_offset[i] += adj_offset[i - 1];

    /* ---- allocate & fill adjacency list ---- */
    uint32_t total_edges = adj_offset[u_count];
    adj_list = (uint16_t *)malloc(total_edges * sizeof(uint16_t));

    /* temporary write cursors (re-use adj_offset idea with a copy) */
    uint32_t *cursor = (uint32_t *)malloc((u_count + 1) * sizeof(uint32_t));
    memcpy(cursor, adj_offset, (u_count + 1) * sizeof(uint32_t));

    for (uint32_t ui = 0; ui < u_count; ui++) {
        uint32_t s = u_state[ui];
        for (int bit = 0; bit < m; bit++) {
            uint32_t nb = s ^ (1u << bit);
            if (is_valid[nb] && v_id[nb] != NIL) {
                adj_list[cursor[ui]++] = v_id[nb];
            }
        }
    }

    free(cursor);
}

/* ------------------------------------------------------------------ */
/*  Hopcroft-Karp: BFS phase                                          */
/* ------------------------------------------------------------------ */

static int hk_bfs(void) {
    uint32_t head = 0, tail = 0;

    for (uint32_t ui = 0; ui < u_count; ui++) {
        if (match_u[ui] == NIL) {
            dist[ui] = 0;
            queue[tail++] = (uint16_t)ui;
        } else {
            dist[ui] = INF;
        }
    }

    int found = 0;

    while (head < tail) {
        uint16_t ui = queue[head++];
        uint32_t start = adj_offset[ui];
        uint32_t end   = adj_offset[ui + 1];

        for (uint32_t e = start; e < end; e++) {
            uint16_t vi = adj_list[e];
            uint16_t mu = match_v[vi]; /* who is vi matched to? */

            if (mu == NIL) {
                /* vi is free — an augmenting path exists */
                found = 1;
            } else if (dist[mu] == INF) {
                dist[mu] = dist[ui] + 1;
                queue[tail++] = mu;
            }
        }
    }

    return found;
}

/* ------------------------------------------------------------------ */
/*  Hopcroft-Karp: DFS phase                                          */
/* ------------------------------------------------------------------ */

static int hk_dfs(uint16_t ui) {
    uint32_t start = adj_offset[ui];
    uint32_t end   = adj_offset[ui + 1];

    for (uint32_t e = start; e < end; e++) {
        uint16_t vi = adj_list[e];
        uint16_t mu = match_v[vi];

        if (mu == NIL || (dist[mu] == dist[ui] + 1 && hk_dfs(mu))) {
            match_u[ui] = vi;
            match_v[vi] = ui;
            return 1;
        }
    }

    dist[ui] = INF; /* remove ui from layered graph */
    return 0;
}

/* ------------------------------------------------------------------ */
/*  Hopcroft-Karp: main driver                                        */
/* ------------------------------------------------------------------ */

static void hopcroft_karp(void) {
    memset(match_u, 0xFF, u_count * sizeof(uint16_t));
    memset(match_v, 0xFF, v_count * sizeof(uint16_t));

    while (hk_bfs()) {
        for (uint32_t ui = 0; ui < u_count; ui++) {
            if (match_u[ui] == NIL)
                hk_dfs(ui);
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Exported function                                                 */
/* ------------------------------------------------------------------ */

/**
 * compute_strategy(m, n) -> pointer to uint16_t[2^m]
 *
 * Returns a heap-allocated array `strategy` where:
 *   strategy[state] = the state the bot should move to, OR
 *   0xFFFF           if no winning move exists from `state`.
 *
 * The caller (JS side) is responsible for freeing this via _free().
 */
EMSCRIPTEN_KEEPALIVE
uint16_t *compute_strategy(int m, int n) {
    uint32_t total = 1u << m;

    /* 1. Build bipartite graph */
    build_graph(m, n);

    /* 2. Compute maximum matching */
    hopcroft_karp();

    /* 3. Translate matching back to state-space strategy */
    uint16_t *strategy = (uint16_t *)malloc(total * sizeof(uint16_t));
    memset(strategy, 0xFF, total * sizeof(uint16_t)); /* default: no move */

    /*
     * The matching gives edges  U_state <-> V_state.
     *
     * For a state in U (even popcount):
     *   If match_u[u_id[state]] != NIL  →  strategy[state] = v_state[match]
     *   (the winning move is to go to the matched V-state)
     *
     * For a state in V (odd popcount):
     *   If match_v[v_id[state]] != NIL  →  strategy[state] = u_state[match]
     */
    for (uint32_t s = 0; s < total; s++) {
        if (!is_valid[s]) continue;

        if (u_id[s] != NIL) {
            /* s is in U */
            uint16_t vi = match_u[u_id[s]];
            if (vi != NIL)
                strategy[s] = v_state[vi];
        } else if (v_id[s] != NIL) {
            /* s is in V */
            uint16_t ui = match_v[v_id[s]];
            if (ui != NIL)
                strategy[s] = u_state[ui];
        }
    }

    /* 4. Clean up the adjacency list (graph is rebuilt each call) */
    free(adj_list);
    adj_list = NULL;

    return strategy;
}
