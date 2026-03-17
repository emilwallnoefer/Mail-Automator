"use client";

export type UiSoundKey =
  | "switchWhoosh"
  | "generateReady"
  | "mailSend"
  | "fillSwoosh"
  | "saveConfirm"
  | "resetTap"
  | "weekReadyGlow"
  | "daysAppearStart"
  | "dayLoggerSlide"
  | "previewWrite";

type SoundConfig = {
  src: string;
  volume: number;
  cooldownMs?: number;
  loop?: boolean;
};

const SOUND_VERSION = "v8-20260317l";

const SOUND_CONFIG: Record<UiSoundKey, SoundConfig> = {
  switchWhoosh: { src: `/sounds/switch-clean-air-v8.wav?v=${SOUND_VERSION}`, volume: 0.52, cooldownMs: 120 },
  generateReady: { src: `/sounds/generate-wind-v7.wav?v=${SOUND_VERSION}`, volume: 0.5, cooldownMs: 120 },
  mailSend: { src: `/sounds/mail-send-wind-v7.wav?v=${SOUND_VERSION}`, volume: 0.52, cooldownMs: 140 },
  fillSwoosh: { src: `/sounds/fill-wind-v7.wav?v=${SOUND_VERSION}`, volume: 0.5, cooldownMs: 140 },
  saveConfirm: { src: `/sounds/save-day-paper-v1.wav?v=${SOUND_VERSION}`, volume: 0.52, cooldownMs: 120 },
  resetTap: { src: `/sounds/reset-thud-v5.wav?v=${SOUND_VERSION}`, volume: 0.56, cooldownMs: 100 },
  weekReadyGlow: { src: `/sounds/week-glow-whoosh-v1.wav?v=${SOUND_VERSION}`, volume: 0.5, loop: true },
  daysAppearStart: { src: `/sounds/days-appear-rise-v1.wav?v=${SOUND_VERSION}`, volume: 0.26, cooldownMs: 120 },
  dayLoggerSlide: { src: `/sounds/day-logger-slide-v1.wav?v=${SOUND_VERSION}`, volume: 0.23, cooldownMs: 80 },
  previewWrite: { src: `/sounds/live-preview-write-full-v1.wav?v=${SOUND_VERSION}`, volume: 0.2, loop: false },
};

const cache = new Map<UiSoundKey, HTMLAudioElement>();
const lastPlayedAt = new Map<UiSoundKey, number>();
const fadeIntervals = new Map<UiSoundKey, number>();

function canPlay() {
  return typeof window !== "undefined" && typeof Audio !== "undefined";
}

function getAudio(sound: UiSoundKey) {
  const existing = cache.get(sound);
  const config = SOUND_CONFIG[sound];
  if (existing) {
    if (existing.src.includes(config.src)) return existing;
    existing.src = config.src;
    existing.load();
    existing.volume = config.volume;
    existing.loop = Boolean(config.loop);
    return existing;
  }
  const audio = new Audio(config.src);
  audio.preload = "auto";
  audio.volume = config.volume;
  audio.loop = Boolean(config.loop);
  cache.set(sound, audio);
  return audio;
}

function clearFadeInterval(sound: UiSoundKey) {
  const intervalId = fadeIntervals.get(sound);
  if (intervalId != null) {
    window.clearInterval(intervalId);
    fadeIntervals.delete(sound);
  }
}

export function playUiSound(sound: UiSoundKey) {
  if (!canPlay()) return;
  const now = Date.now();
  const cooldown = SOUND_CONFIG[sound].cooldownMs ?? 0;
  const prev = lastPlayedAt.get(sound) ?? 0;
  if (now - prev < cooldown) return;
  lastPlayedAt.set(sound, now);

  try {
    const audio = getAudio(sound);
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Ignore autoplay/user-gesture restriction noise.
    });
  } catch {
    // Keep UI functional even if audio fails.
  }
}

export function startUiSound(sound: UiSoundKey, options?: { fadeInMs?: number; restart?: boolean }) {
  if (!canPlay()) return;
  try {
    const audio = getAudio(sound);
    const targetVolume = SOUND_CONFIG[sound].volume;
    const shouldRestart = options?.restart ?? true;
    const fadeInMs = Math.max(0, options?.fadeInMs ?? 0);
    clearFadeInterval(sound);
    if (shouldRestart) audio.currentTime = 0;
    if (fadeInMs <= 0) {
      audio.volume = targetVolume;
      void audio.play().catch(() => {
        // Ignore autoplay/user-gesture restriction noise.
      });
      return;
    }
    audio.volume = 0;
    void audio.play().catch(() => {
      // Ignore autoplay/user-gesture restriction noise.
    });
    const startedAt = performance.now();
    const intervalId = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / fadeInMs);
      audio.volume = targetVolume * progress;
      if (progress >= 1) {
        clearFadeInterval(sound);
      }
    }, 20);
    fadeIntervals.set(sound, intervalId);
  } catch {
    // Keep UI functional even if audio fails.
  }
}

export function stopUiSound(sound: UiSoundKey, options?: { fadeOutMs?: number }) {
  if (!canPlay()) return;
  const audio = cache.get(sound);
  if (!audio) return;
  try {
    const fadeOutMs = Math.max(0, options?.fadeOutMs ?? 0);
    clearFadeInterval(sound);
    if (fadeOutMs <= 0) {
      audio.pause();
      audio.currentTime = 0;
      return;
    }
    const startVolume = audio.volume;
    const startedAt = performance.now();
    const intervalId = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / fadeOutMs);
      audio.volume = startVolume * (1 - progress);
      if (progress >= 1) {
        clearFadeInterval(sound);
        audio.pause();
        audio.currentTime = 0;
        audio.volume = SOUND_CONFIG[sound].volume;
      }
    }, 20);
    fadeIntervals.set(sound, intervalId);
  } catch {
    // Ignore stop failures to keep UI responsive.
  }
}
