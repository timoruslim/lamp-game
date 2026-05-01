"use client";

/**
 * audioUtils.ts — Tiny Web Audio helpers for game sounds without external files.
 */

let audioCtx: AudioContext | null = null;

export function getAudioCtx(): AudioContext {
  if (typeof window !== "undefined" && !audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx!;
}

/** Tonal "click" for lamp toggle — a quick sine blip. */
export function playClickSound(): void {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch {}
}

/** Harsh "buzz" for invalid moves. */
export function playErrorSound(): void {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 110;
    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch {}
}

/** Professional interface UI click sound for buttons. */
export function playButtonClickSound(): void {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.05);
  } catch {}
}

/** High pitched static/spark sound for horror flicker. */
export function playFlickerSound(): void {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(1200 + Math.random() * 800, ctx.currentTime);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.05);
  } catch {}
}

/** Bright, happy chime to signal the player won. */
export function playWinDetectedSound(): void {
  try {
    if (typeof window !== "undefined") {
      const audio = new Audio("/sound/win.wav");
      audio.volume = 0.8; // adjust volume if needed
      audio.play().catch(() => {});
    }
  } catch {}
}

/** Deep swoosh / bass drop to signal the player lost. */
export function playLoseDetectedSound(): void {
  try {
    if (typeof window !== "undefined") {
      const audio = new Audio("/sound/lose.wav");
      audio.volume = 0.8; // adjust volume if needed
      audio.play().catch(() => {});
    }
  } catch {}
}

/** Very short, subtle tick sound for sliding the configuration range sliders. */
export function playSliderSound(): void {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.03);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.03);
  } catch {}
}

/** High pitched bling for coin placement and collection. */
export function playCoinSound(): void {
  try {
    if (typeof window !== "undefined") {
      const audio = new Audio("/sound/coin_sound.mp3");
      audio.volume = 0.6; // adjust volume if needed
      audio.play().catch(() => {});
    }
  } catch {}
}
