#include <stdint.h>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
static inline double emscripten_get_now(void) { return 0.0; }
#endif

/* ---- Transposition Table (direct-mapped, always-replace) ---- */
#define TT_BITS 22
#define TT_SIZE (1 << TT_BITS)
#define TT_EMPTY 0xFFFFFFFFFFFFFFFFULL

static uint64_t tt_keys[TT_SIZE];
static int32_t  tt_vals[TT_SIZE];

/* Zobrist Keys */
static uint64_t zobrist_keys[64];

/* PRNG for Zobrist keys */
static uint64_t xorshift64(uint64_t *state) {
    uint64_t x = *state;
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    return *state = x;
}

static void init_zobrist(void) {
    uint64_t seed = 0x123456789ABCDEF0ULL;
    for (int i = 0; i < 64; i++) {
        zobrist_keys[i] = xorshift64(&seed);
    }
}

static void init_tt(void) {
    for (int i = 0; i < TT_SIZE; i++) {
        tt_keys[i] = TT_EMPTY;
    }
    init_zobrist();
}

static inline uint64_t zobrist_hash(uint64_t state) {
    uint64_t h = 0;
    uint64_t temp = state;
    while (temp) {
        int bit = __builtin_ctzll(temp);
        temp &= temp - 1;
        h ^= zobrist_keys[bit];
    }
    return h;
}

static inline int tt_lookup(uint64_t canon_state, uint64_t z_hash) {
    uint32_t idx = z_hash & (TT_SIZE - 1);
    if (tt_keys[idx] == canon_state) return tt_vals[idx];
    return -1;
}

static inline void tt_store(uint64_t canon_state, uint64_t z_hash, int val) {
    uint32_t idx = z_hash & (TT_SIZE - 1);
    tt_keys[idx] = canon_state;
    tt_vals[idx] = (int32_t)val;
}

/* ---- Attack Masks and Symmetry Maps ---- */
static uint64_t attack_masks[64];
static int map_H[64], map_V[64], map_R[64];
static int cur_n = 0, cur_m = 0;

static void compute_masks_and_maps(int n, int m) {
    if (n == cur_n && m == cur_m) return;
    cur_n = n; cur_m = m;
    for (int r = 0; r < n; r++) {
        for (int c = 0; c < m; c++) {
            int idx = r * m + c;
            uint64_t mask = 1ULL << idx;
            if (r > 0)   mask |= 1ULL << ((r-1)*m + c);
            if (r < n-1) mask |= 1ULL << ((r+1)*m + c);
            if (c > 0)   mask |= 1ULL << (r*m + (c-1));
            if (c < m-1) mask |= 1ULL << (r*m + (c+1));
            attack_masks[idx] = mask;

            map_H[idx] = (n - 1 - r) * m + c;
            map_V[idx] = r * m + (m - 1 - c);
            map_R[idx] = (n - 1 - r) * m + (m - 1 - c);
        }
    }
}

static inline uint64_t transform(uint64_t state, const int* mapping) {
    uint64_t res = 0;
    uint64_t temp = state;
    while(temp) {
        int bit = __builtin_ctzll(temp);
        temp &= temp - 1;
        res |= (1ULL << mapping[bit]);
    }
    return res;
}

static inline uint64_t canonicalize(uint64_t state) {
    uint64_t min_state = state;
    
    uint64_t h = transform(state, map_H);
    if (h < min_state) min_state = h;
    
    uint64_t v = transform(state, map_V);
    if (v < min_state) min_state = v;
    
    uint64_t r = transform(state, map_R);
    if (r < min_state) min_state = r;
    
    return min_state;
}

/* ---- Frontier-based Flood Fill ---- */
static uint64_t get_component(uint64_t state, int start_bit) {
    uint64_t comp = 1ULL << start_bit;
    uint64_t frontier = comp;
    while (frontier) {
        uint64_t next = 0;
        uint64_t t = frontier;
        while (t) {
            int b = __builtin_ctzll(t);
            t &= t - 1;
            next |= attack_masks[b];
        }
        next &= state & ~comp;
        comp |= next;
        frontier = next;
    }
    return comp;
}

/* ---- Time-limited Grundy ---- */
static double deadline;
static int aborted;
static uint32_t node_count;

static int grundy(uint64_t state) {
    if (state == 0) return 0;

    if ((++node_count & 0xFFF) == 0) {
        if (emscripten_get_now() >= deadline) {
            aborted = 1;
            return -1;
        }
    }
    if (aborted) return -1;

    uint64_t canon = canonicalize(state);
    uint64_t z = zobrist_hash(canon);

    int cached = tt_lookup(canon, z);
    if (cached >= 0) return cached;

    /* Component splitting */
    int first_bit = __builtin_ctzll(state);
    uint64_t comp = get_component(state, first_bit);

    if (comp != state) {
        int g1 = grundy(comp);
        if (aborted) return -1;
        int g2 = grundy(state & ~comp);
        if (aborted) return -1;
        int val = g1 ^ g2;
        tt_store(canon, z, val);
        return val;
    }

    /* Single component: MEX */
    uint64_t seen = 0;
    uint64_t temp = state;
    while (temp) {
        int bit = __builtin_ctzll(temp);
        temp &= temp - 1;
        uint64_t next_state = state & ~attack_masks[bit];
        int g = grundy(next_state);
        if (aborted) return -1;
        if (g < 64) seen |= (1ULL << g);
    }

    int mex = (~seen == 0) ? 64 : __builtin_ctzll(~seen);
    tt_store(canon, z, mex);
    return mex;
}

/* ---- Exported ---- */

EMSCRIPTEN_KEEPALIVE
void init_game(int n, int m) {
    init_tt();
    compute_masks_and_maps(n, m);
}

EMSCRIPTEN_KEEPALIVE
int get_best_move(uint32_t state_low, uint32_t state_high, int n, int m, int time_limit_ms) {
    uint64_t current_state = ((uint64_t)state_high << 32) | state_low;
    if (current_state == 0) return -1;

    compute_masks_and_maps(n, m);

    deadline = emscripten_get_now() + (double)time_limit_ms;
    aborted = 0;
    node_count = 0;

    int best_move = -1;
    uint64_t temp = current_state;

    while (temp) {
        int move = __builtin_ctzll(temp);
        temp &= temp - 1;

        if (best_move == -1) best_move = move;

        uint64_t next_state = current_state & ~attack_masks[move];
        int g = grundy(next_state);

        if (aborted) break;
        if (g == 0) return move;
    }

    return best_move;
}
