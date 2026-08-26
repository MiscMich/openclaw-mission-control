/**
 * OpenClaw Mission Control — Sound Notification System
 *
 * Provides audio feedback for UI events:
 * - notification: General toast notifications
 * - success: Task completion, successful actions
 * - error: Errors, failures
 * - message: Agent messages received
 *
 * Built with Web Audio API tone generation (no external dependencies).
 */

"use client";

import { useCallback, useState } from "react";

/**
 * Sound types available in the system
 */
export type SoundType = "notification" | "success" | "error" | "message";

/**
 * Sound configuration interface
 */
export interface SoundConfig {
  volume?: number;
  playbackRate?: number;
  interrupt?: boolean;
  soundEnabled?: boolean;
}

/**
 * Default sound configuration
 */
const DEFAULT_CONFIG: Required<SoundConfig> = {
  volume: 0.3,
  playbackRate: 1,
  interrupt: true,
  soundEnabled: true,
};

/**
 * Tone definitions for each sound type
 */
interface ToneDefinition {
  type: OscillatorType;
  frequency: number;
  endFrequency?: number;
  duration: number;
}

const TONE_DEFINITIONS: Record<SoundType, ToneDefinition> = {
  notification: { type: "sine", frequency: 800, duration: 0.15 },
  success: { type: "sine", frequency: 1200, endFrequency: 1400, duration: 0.2 },
  error: { type: "square", frequency: 300, duration: 0.3 },
  message: { type: "triangle", frequency: 600, duration: 0.2 },
};

/**
 * Singleton AudioContext, lazy-initialized on first play
 */
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioContext = new AC();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  return audioContext;
}

/**
 * Play a tone using Web Audio API
 */
function playTone(soundType: SoundType, volume: number): void {
  const ctx = getAudioContext();
  const tone = TONE_DEFINITIONS[soundType];
  const now = ctx.currentTime;

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = tone.type;
  oscillator.frequency.setValueAtTime(tone.frequency, now);

  if (tone.endFrequency) {
    oscillator.frequency.linearRampToValueAtTime(tone.endFrequency, now + tone.duration);
  }

  gainNode.gain.setValueAtTime(volume, now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + tone.duration);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(now);
  oscillator.stop(now + tone.duration);
}

function getStoredEnabled(defaultValue: boolean): boolean {
  if (typeof window === "undefined") return defaultValue;
  const soundsPref = localStorage.getItem("mc_sounds_enabled");
  return soundsPref === null ? defaultValue : soundsPref === "true";
}

function getStoredVolume(defaultValue: number): number {
  if (typeof window === "undefined") return defaultValue;
  const volumePref = localStorage.getItem("mc_sounds_volume");
  if (volumePref === null) return defaultValue;
  const parsed = Number.parseFloat(volumePref);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : defaultValue;
}

/**
 * Hook to play a specific sound type
 *
 * @param soundType - Type of sound to play
 * @param config - Optional sound configuration
 * @returns [play, { stop }]
 *
 * @example
 * const [playSuccess] = useNotificationSound("success");
 * playSuccess(); // Plays success sound
 */
export function useNotificationSound(
  soundType: SoundType,
  config: SoundConfig = {}
) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const [isEnabled] = useState(() => getStoredEnabled(mergedConfig.soundEnabled));

  const play = useCallback(() => {
    if (!isEnabled || !mergedConfig.soundEnabled) return;
    if (typeof window === "undefined") return;

    try {
      const storedVolume = localStorage.getItem("mc_sounds_volume");
      const volume = storedVolume ? parseFloat(storedVolume) : mergedConfig.volume;
      playTone(soundType, volume);
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[Sound] Failed to play ${soundType}:`, error);
      }
    }
  }, [isEnabled, mergedConfig.soundEnabled, mergedConfig.volume, soundType]);

  const stop = useCallback(() => {
    // No-op: Web Audio tones are short and self-terminating
  }, []);

  return [play, { stop }] as const;
}

/**
 * Hook to manage sound system settings
 *
 * @returns Object with sound control methods
 *
 * @example
 * const { enabled, setEnabled, volume, setVolume } = useSoundSettings();
 */
export function useSoundSettings() {
  const [enabled, setEnabledState] = useState(() => getStoredEnabled(true));
  const [volume, setVolumeState] = useState(() => getStoredVolume(0.3));

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    if (typeof window !== "undefined") {
      localStorage.setItem("mc_sounds_enabled", value.toString());
    }
  }, []);

  const setVolume = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    setVolumeState(clamped);
    if (typeof window !== "undefined") {
      localStorage.setItem("mc_sounds_volume", clamped.toString());
    }
  }, []);

  return {
    enabled,
    setEnabled,
    volume,
    setVolume,
  };
}

/**
 * Utility to play a sound without a hook (e.g., outside React components)
 *
 * @param soundType - Type of sound to play
 * @param config - Optional sound configuration
 */
export function playSound(soundType: SoundType, config: SoundConfig = {}) {
  if (typeof window === "undefined") return;

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const soundsEnabled = localStorage.getItem("mc_sounds_enabled");
  if (soundsEnabled === "false" || !mergedConfig.soundEnabled) return;

  const storedVolume = localStorage.getItem("mc_sounds_volume");
  const volume = storedVolume ? parseFloat(storedVolume) : mergedConfig.volume;

  try {
    playTone(soundType, volume);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[Sound] Failed to play ${soundType}:`, error);
    }
  }
}

/**
 * No-op: Web Audio API does not require preloading
 */
export function preloadSounds() {
  // Web Audio generates tones on the fly — nothing to preload
}
