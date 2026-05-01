/**
 * main.c — Combinatorial Light-Bulb Game Solver (Wasm Backend)
 *
 * Builds a bipartite graph of valid game states and computes a maximum
 * matching via Hopcroft-Karp. The matching determines WHO wins:
 *   - strategy[0] == NIL  → Player 2 (bot) wins with perfect play
 *   - strategy[0] != NIL  → Player 1 wins with perfect play
 *
 * After Hopcroft-Karp, try_unmatch_state0() attempts to push state 0
 * out of the matching. This ensures that when Player 2 CAN win, the
 * matching correctly reflects it (state 0 unmatched).
 *
 * Bipartite partition:
 *   U = states with even popcount (state 0 is here)
 *   V = states with odd  popcount
 *
 * Exported: uint16_t *compute_strategy(int m, int n)
 *   Caller frees the returned buffer with free().
 */

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

/* ------------------------------------------------------------------ */
/*  Popcount                                                          */
/* ------------------------------------------------------------------ */

static inline int popcount(uint32_t x) {
    x = x - ((x >> 1) & 0x55555555u);
    x = (x & 0x33333333u) + ((x >> 2) & 0x33333333u);
    return (int)(((x + (x >> 4)) & 0x0F0F0F0Fu) * 0x01010101u >> 24);
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

#define MAX_M       16
#define MAX_STATES  (1 << MAX_M)
#define NIL         0xFFFFu
#define INF         0x7FFFFFFFu

/* ------------------------------------------------------------------ */
/*  Data structures                                                   */
/* ------------------------------------------------------------------ */

static uint32_t adj_offset[MAX_STATES + 1];
static uint16_t *adj_list;
static uint16_t match_u[MAX_STATES], match_v[MAX_STATES];
static uint32_t dist[MAX_STATES];
static uint16_t bfs_queue[MAX_STATES];
static uint8_t  is_valid[MAX_STATES];
static uint16_t u_id[MAX_STATES], v_id[MAX_STATES];
static uint16_t u_state[MAX_STATES], v_state[MAX_STATES];
static uint32_t u_count, v_count;
static int g_m;

/* ------------------------------------------------------------------ */
/*  Build bipartite graph (CSR)                                       */
/* ------------------------------------------------------------------ */

static void build_graph(int m, int n) {
    uint32_t total = 1u << m;
    g_m = m;
    u_count = v_count = 0;
    memset(u_id, 0xFF, sizeof(u_id));
    memset(v_id, 0xFF, sizeof(v_id));

    for (uint32_t s = 0; s < total; s++) {
        int pc = popcount(s);
        is_valid[s] = (pc <= n) ? 1 : 0;
        if (!is_valid[s]) continue;
        if (pc & 1) { v_id[s] = (uint16_t)v_count; v_state[v_count++] = (uint16_t)s; }
        else         { u_id[s] = (uint16_t)u_count; u_state[u_count++] = (uint16_t)s; }
    }

    memset(adj_offset, 0, (u_count + 1) * sizeof(uint32_t));
    for (uint32_t ui = 0; ui < u_count; ui++) {
        uint32_t deg = 0;
        for (int bit = 0; bit < m; bit++) {
            uint32_t nb = u_state[ui] ^ (1u << bit);
            if (is_valid[nb] && v_id[nb] != NIL) deg++;
        }
        adj_offset[ui + 1] = deg;
    }
    for (uint32_t i = 1; i <= u_count; i++) adj_offset[i] += adj_offset[i - 1];

    adj_list = (uint16_t *)malloc(adj_offset[u_count] * sizeof(uint16_t));
    uint32_t *cur = (uint32_t *)malloc((u_count + 1) * sizeof(uint32_t));
    memcpy(cur, adj_offset, (u_count + 1) * sizeof(uint32_t));
    for (uint32_t ui = 0; ui < u_count; ui++) {
        for (int bit = 0; bit < m; bit++) {
            uint32_t nb = u_state[ui] ^ (1u << bit);
            if (is_valid[nb] && v_id[nb] != NIL)
                adj_list[cur[ui]++] = v_id[nb];
        }
    }
    free(cur);
}

/* ------------------------------------------------------------------ */
/*  Hopcroft-Karp                                                     */
/* ------------------------------------------------------------------ */

static int hk_bfs(void) {
    uint32_t head = 0, tail = 0;
    for (uint32_t ui = 0; ui < u_count; ui++) {
        if (match_u[ui] == NIL) { dist[ui] = 0; bfs_queue[tail++] = (uint16_t)ui; }
        else dist[ui] = INF;
    }
    int found = 0;
    while (head < tail) {
        uint16_t ui = bfs_queue[head++];
        for (uint32_t e = adj_offset[ui]; e < adj_offset[ui + 1]; e++) {
            uint16_t vi = adj_list[e], mu = match_v[vi];
            if (mu == NIL) found = 1;
            else if (dist[mu] == INF) { dist[mu] = dist[ui] + 1; bfs_queue[tail++] = mu; }
        }
    }
    return found;
}

static int hk_dfs(uint16_t ui) {
    for (uint32_t e = adj_offset[ui]; e < adj_offset[ui + 1]; e++) {
        uint16_t vi = adj_list[e], mu = match_v[vi];
        if (mu == NIL || (dist[mu] == dist[ui] + 1 && hk_dfs(mu))) {
            match_u[ui] = vi; match_v[vi] = ui; return 1;
        }
    }
    dist[ui] = INF; return 0;
}

static void hopcroft_karp(void) {
    memset(match_u, 0xFF, u_count * sizeof(uint16_t));
    memset(match_v, 0xFF, v_count * sizeof(uint16_t));
    while (hk_bfs()) {
        for (uint32_t ui = 0; ui < u_count; ui++)
            if (match_u[ui] == NIL) hk_dfs(ui);
    }
}

/* ------------------------------------------------------------------ */
/*  Try to push state 0 out of the matching                           */
/* ------------------------------------------------------------------ */

static uint8_t rv[MAX_STATES];

static int try_rematch(uint16_t vi, uint16_t excl) {
    uint32_t vs = v_state[vi];
    for (int bit = 0; bit < g_m; bit++) {
        uint32_t ns = vs ^ (1u << bit);
        if (!is_valid[ns] || u_id[ns] == NIL) continue;
        uint16_t ui = u_id[ns];
        if (ui == excl || rv[ui]) continue;
        rv[ui] = 1;
        if (match_u[ui] == NIL || try_rematch(match_u[ui], excl)) {
            match_u[ui] = vi; match_v[vi] = ui; return 1;
        }
    }
    return 0;
}

static void try_unmatch_state0(void) {
    uint16_t u0 = u_id[0];
    if (u0 == NIL || match_u[u0] == NIL) return;
    uint16_t v0 = match_u[u0];
    match_u[u0] = NIL; match_v[v0] = NIL;
    memset(rv, 0, u_count); rv[u0] = 1;
    if (!try_rematch(v0, u0)) { match_u[u0] = v0; match_v[v0] = u0; }
}

/* ------------------------------------------------------------------ */
/*  Exported: compute_strategy                                        */
/* ------------------------------------------------------------------ */

EMSCRIPTEN_KEEPALIVE
uint16_t *compute_strategy(int m, int n) {
    uint32_t total = 1u << m;
    build_graph(m, n);
    hopcroft_karp();
    try_unmatch_state0();

    uint16_t *strategy = (uint16_t *)malloc(total * sizeof(uint16_t));
    memset(strategy, 0xFF, total * sizeof(uint16_t));
    for (uint32_t s = 0; s < total; s++) {
        if (!is_valid[s]) continue;
        if (u_id[s] != NIL && match_u[u_id[s]] != NIL)
            strategy[s] = v_state[match_u[u_id[s]]];
        else if (v_id[s] != NIL && match_v[v_id[s]] != NIL)
            strategy[s] = u_state[match_v[v_id[s]]];
    }
    free(adj_list); adj_list = NULL;
    return strategy;
}
