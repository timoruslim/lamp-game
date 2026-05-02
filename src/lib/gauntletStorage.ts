/**
 * gauntletStorage.ts — Persistence layer for Gauntlet mode.
 *
 * Stores per-stage completion status in localStorage under the key "gauntletProgress".
 * Shape: Record<string, "completed_win" | "completed_loss">
 */

const STORAGE_KEY = "gauntletProgress";

export type StageResult = "completed_win" | "completed_loss";

export type GauntletProgress = Record<string, StageResult>;

/** Read the full progress object from localStorage. */
export function getGauntletProgress(): GauntletProgress {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GauntletProgress) : {};
  } catch {
    return {};
  }
}

/** Persist the result of a single stage. */
export function setStageResult(stage: number, result: StageResult): void {
  if (typeof window === "undefined") return;
  try {
    const progress = getGauntletProgress();
    progress[String(stage)] = result;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // silent fail — localStorage may be full or blocked
  }
}

/** Check whether a given stage has been completed (win or loss). */
export function isStageCompleted(stage: number): boolean {
  const progress = getGauntletProgress();
  return String(stage) in progress;
}

/** Get the result for a specific stage, or null if not yet played. */
export function getStageResult(stage: number): StageResult | null {
  const progress = getGauntletProgress();
  return progress[String(stage)] ?? null;
}

/** Reset all progress (for dev/debug). */
export function resetGauntletProgress(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
