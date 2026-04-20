/**
 * solver.worker.ts — Web Worker that bridges the React UI and the Wasm solver.
 *
 * Lifecycle:
 *   1. On instantiation, loads the Emscripten glue JS from /wasm/game_solver.js.
 *   2. Once the Wasm runtime is initialised, posts { type: "READY" }.
 *   3. Listens for { type: "COMPUTE", m, n } messages.
 *   4. Calls the C-exported `compute_strategy(m, n)`, copies the result out of
 *      Wasm linear memory, frees the C-side buffer, and posts the strategy back
 *      as a transferable Uint16Array.
 */

/* ------------------------------------------------------------------ */
/*  Emscripten Module typings (minimal surface we actually use)       */
/* ------------------------------------------------------------------ */

interface EmscriptenModule {
  onRuntimeInitialized?: () => void;
  _compute_strategy(m: number, n: number): number;
  _free(ptr: number): void;
  ccall(ident: string, returnType: string, argTypes: string[], args: unknown[]): number;
}

/* Emscripten places these as globals in the worker scope via importScripts. */
declare let HEAPU16: Uint16Array;

/* ------------------------------------------------------------------ */
/*  Globals                                                           */
/* ------------------------------------------------------------------ */

/* Minimal worker-global typings — avoids needing the full "webworker" lib,
   which conflicts with DOM types used in the rest of the Next.js app. */
interface WorkerSelf {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: string, listener: (ev: MessageEvent) => void): void;
  importScripts(...urls: string[]): void;
}

const ctx = self as unknown as WorkerSelf;

let Module: EmscriptenModule | null = null;
let wasmReady = false;

/* Queue requests that arrive before Wasm is ready. */
let pendingRequest: { m: number; n: number } | null = null;

/* ------------------------------------------------------------------ */
/*  Load the Emscripten glue script                                   */
/* ------------------------------------------------------------------ */

/**
 * Emscripten's generated JS file (`game_solver.js`) expects a global `Module`
 * object.  We define it on `self` so `importScripts` picks it up, then
 * capture the fully-initialised module in the callback.
 */
(ctx as unknown as Record<string, unknown>).Module = {
  locateFile(path: string) {
    // Emscripten resolves .wasm relative to the script URL, which inside a
    // bundled worker points to /_next/static/... — redirect to /wasm/.
    return "/wasm/" + path;
  },
  onRuntimeInitialized() {
    Module = (ctx as unknown as Record<string, { Module: EmscriptenModule }>).Module as unknown as EmscriptenModule;
    wasmReady = true;

    // Notify the main thread that the solver is ready.
    ctx.postMessage({ type: "READY" });

    // If a request arrived while we were still booting, process it now.
    if (pendingRequest) {
      const { m, n } = pendingRequest;
      pendingRequest = null;
      computeAndPost(m, n);
    }
  },
};

// Load the Emscripten-generated glue code (places everything on the worker global).
ctx.importScripts("/wasm/game_solver.js");

/* ------------------------------------------------------------------ */
/*  Core computation                                                  */
/* ------------------------------------------------------------------ */

function computeAndPost(m: number, n: number): void {
  if (!Module) {
    ctx.postMessage({ type: "ERROR", message: "Wasm module not initialised." });
    return;
  }

  try {
    // 1. Call into Wasm — returns a byte-offset pointer into linear memory.
    const ptr: number = Module._compute_strategy(m, n);

    if (ptr === 0) {
      ctx.postMessage({ type: "ERROR", message: "compute_strategy returned null." });
      return;
    }

    // 2. Total number of states = 2^m.
    const totalStates = 1 << m;

    // 3. Read the strategy array from the Wasm heap.
    //    HEAPU16 is a global placed by Emscripten via importScripts.
    //    ptr is a byte offset; divide by 2 for uint16 indexing.
    const wasmArray = HEAPU16.subarray(ptr / 2, ptr / 2 + totalStates);

    // 4. Copy into a standalone JS-owned buffer (the Wasm heap may move/grow).
    const strategy = new Uint16Array(wasmArray);

    // 5. Free the C-side allocation.
    Module._free(ptr);

    // 6. Transfer the buffer to the main thread (zero-copy).
    ctx.postMessage(
      { type: "RESULT", strategy },
      [strategy.buffer] as unknown as Transferable[]
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.postMessage({ type: "ERROR", message });
  }
}

/* ------------------------------------------------------------------ */
/*  Message handler                                                   */
/* ------------------------------------------------------------------ */

ctx.addEventListener("message", (event: MessageEvent) => {
  const data = event.data;

  if (data?.type !== "COMPUTE") return;

  const { m, n } = data as { m: number; n: number };

  // Validate inputs.
  if (typeof m !== "number" || typeof n !== "number" || m < 1 || m > 16 || n < 1 || n > m) {
    ctx.postMessage({
      type: "ERROR",
      message: `Invalid parameters: m=${m}, n=${n}. Need 1 ≤ n ≤ m ≤ 16.`,
    });
    return;
  }

  if (!wasmReady) {
    // Wasm is still loading — queue the request.
    pendingRequest = { m, n };
    return;
  }

  computeAndPost(m, n);
});
