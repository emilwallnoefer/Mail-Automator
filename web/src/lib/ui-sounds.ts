"use client";

export type UiSoundKey =
  | "switchWhoosh"
  | "generateReady"
  | "mailSend"
  | "fillSwoosh"
  | "saveConfirm"
  | "resetTap";

type SoundConfig = {
  src: string;
  volume: number;
  cooldownMs?: number;
};

const SOUND_VERSION = "v7-20260316e";

const SOUND_CONFIG: Record<UiSoundKey, SoundConfig> = {
  switchWhoosh: { src: `/sounds/switch-wind-v7.wav?v=${SOUND_VERSION}`, volume: 0.56, cooldownMs: 80 },
  generateReady: { src: `/sounds/generate-wind-v7.wav?v=${SOUND_VERSION}`, volume: 0.5, cooldownMs: 120 },
  mailSend: { src: `/sounds/mail-send-wind-v7.wav?v=${SOUND_VERSION}`, volume: 0.52, cooldownMs: 140 },
  fillSwoosh: { src: `/sounds/fill-wind-v7.wav?v=${SOUND_VERSION}`, volume: 0.5, cooldownMs: 140 },
  saveConfirm: { src: `/sounds/save-rise-v5.wav?v=${SOUND_VERSION}`, volume: 0.52, cooldownMs: 120 },
  resetTap: { src: `/sounds/reset-thud-v5.wav?v=${SOUND_VERSION}`, volume: 0.56, cooldownMs: 100 },
};

const cache = new Map<UiSoundKey, HTMLAudioElement>();
const lastPlayedAt = new Map<UiSoundKey, number>();

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
    return existing;
  }
  const audio = new Audio(config.src);
  audio.preload = "auto";
  audio.volume = config.volume;
  cache.set(sound, audio);
  return audio;
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
