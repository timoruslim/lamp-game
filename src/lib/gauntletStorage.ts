/**
 * gauntletStorage.ts — Multi-participant persistence layer for Gauntlet mode.
 *
 * localStorage keys:
 *   "gauntletDB"                — Record<participantId, GauntletProgress>
 *   "gauntletActiveParticipant" — currently active participant ID (string)
 */

const DB_KEY = "gauntletDB";
const ACTIVE_KEY = "gauntletActiveParticipant";

export type StageResult = "completed_win" | "completed_loss";

export type GauntletProgress = Record<string, StageResult>;

type GauntletDB = Record<string, GauntletProgress>;

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                    */
/* ------------------------------------------------------------------ */

function readDB(): GauntletDB {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? (JSON.parse(raw) as GauntletDB) : {};
  } catch {
    return {};
  }
}

function writeDB(db: GauntletDB): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    // silent fail — localStorage may be full or blocked
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

/** Get the full progress for a specific participant. */
export function getParticipantProgress(id: string): GauntletProgress {
  const db = readDB();
  return db[id] ?? {};
}

/** Persist a stage result for a specific participant. */
export function setParticipantStageResult(
  id: string,
  stage: number,
  result: StageResult
): void {
  const db = readDB();
  if (!db[id]) db[id] = {};
  db[id][String(stage)] = result;
  writeDB(db);
}

/** Store the currently active participant ID. */
export function setActiveParticipant(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_KEY, id);
}

/** Read the currently active participant ID. */
export function getActiveParticipant(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_KEY);
}
