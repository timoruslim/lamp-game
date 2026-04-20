/**
 * solver.worker.js — Web Worker that bridges the React UI and the Wasm solver.
 *
 * This file lives in /public so it is NOT bundled by Turbopack.
 * It uses importScripts to load the Emscripten glue, which then
 * places HEAPU16, Module._compute_strategy, etc. as globals in this scope.
 */

/* ------------------------------------------------------------------ */
/*  Set up the Emscripten Module before loading the glue script        */
/* ------------------------------------------------------------------ */

var Module = {
  locateFile: function (path) {
    return "/wasm/" + path;
  },
  onRuntimeInitialized: function () {
    // Notify main thread that the solver is ready.
    self.postMessage({ type: "READY" });

    // If a request arrived while we were still booting, process it now.
    if (_pendingRequest) {
      var req = _pendingRequest;
      _pendingRequest = null;
      computeAndPost(req.m, req.n);
    }
  },
};

var _wasmReady = false;
var _pendingRequest = null;

// Load the Emscripten-generated glue code.
// After this call, Module._compute_strategy, Module._free, HEAPU16, etc.
// are all available as globals in this worker scope.
importScripts("/wasm/game_solver.js");

// Mark as ready after the synchronous importScripts + async wasm init.
// onRuntimeInitialized will fire when wasm is truly ready.

/* ------------------------------------------------------------------ */
/*  Core computation                                                  */
/* ------------------------------------------------------------------ */

function computeAndPost(m, n) {
  try {
    // 1. Call into Wasm — returns a byte-offset pointer into linear memory.
    var ptr = Module._compute_strategy(m, n);

    if (ptr === 0) {
      self.postMessage({ type: "ERROR", message: "compute_strategy returned null." });
      return;
    }

    // 2. Total number of states = 2^m.
    var totalStates = 1 << m;

    // 3. Read the strategy array from the Wasm heap.
    //    HEAPU16 is a global placed by Emscripten.
    //    ptr is a byte offset; divide by 2 for uint16 indexing.
    var wasmArray = HEAPU16.subarray(ptr / 2, ptr / 2 + totalStates);

    // 4. Copy into a standalone JS-owned buffer.
    var strategy = new Uint16Array(wasmArray);

    // 5. Free the C-side allocation.
    Module._free(ptr);

    // 6. Transfer the buffer to the main thread (zero-copy).
    self.postMessage({ type: "RESULT", strategy: strategy }, [strategy.buffer]);
  } catch (err) {
    var message = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: "ERROR", message: message });
  }
}

/* ------------------------------------------------------------------ */
/*  Message handler                                                   */
/* ------------------------------------------------------------------ */

self.addEventListener("message", function (event) {
  var data = event.data;
  if (!data || data.type !== "COMPUTE") return;

  var m = data.m;
  var n = data.n;

  // Validate inputs.
  if (typeof m !== "number" || typeof n !== "number" || m < 1 || m > 16 || n < 1 || n > m) {
    self.postMessage({
      type: "ERROR",
      message: "Invalid parameters: m=" + m + ", n=" + n + ". Need 1 <= n <= m <= 16.",
    });
    return;
  }

  if (!Module.calledRun) {
    // Wasm is still loading — queue the request.
    _pendingRequest = { m: m, n: n };
    return;
  }

  computeAndPost(m, n);
});
