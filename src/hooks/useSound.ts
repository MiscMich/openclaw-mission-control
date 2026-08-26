"use client";

import { useCallback, useEffect, useRef } from "react";

type SoundType = "chime" | "notification" | "error" | "success";

// Sound frequencies and patterns for Web Audio API
const soundPatterns: Record<SoundType, { freq: number[]; duration: number[] }> = {
  chime: {
    freq: [880, 1100], // A5 -> C#6
    duration: [100, 150],
  },
  notification: {
    freq: [587, 784], // D5 -> G5
    duration: [80, 120],
  },
  success: {
    freq: [523, 659, 784], // C5 -> E5 -> G5 (major chord arpeggio)
    duration: [80, 80, 150],
  },
  error: {
    freq: [392, 330], // G4 -> E4 (descending minor)
    duration: [100, 200],
  },
};

interface UseSoundOptions {
  enabled?: boolean;
  volume?: number;
}

/**
 * Hook for playing notification sounds using Web Audio API
 * No external files needed - generates tones programmatically
 */
export function useSound(options: UseSoundOptions = {}) {
  const { enabled = true, volume = 0.15 } = options;
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize AudioContext lazily (must be after user interaction)
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current && typeof window !== "undefined") {
      audioContextRef.current = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // Play a sequence of tones
  const playSound = useCallback(
    (type: SoundType) => {
      if (!enabled) return;

      const ctx = getAudioContext();
      if (!ctx) return;

      // Resume context if suspended (browser autoplay policy)
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const pattern = soundPatterns[type];
      let startTime = ctx.currentTime;

      pattern.freq.forEach((freq, i) => {
        const duration = pattern.duration[i] / 1000;

        // Create oscillator
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;

        // Create gain for volume envelope
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        // Connect nodes
        osc.connect(gain);
        gain.connect(ctx.destination);

        // Play
        osc.start(startTime);
        osc.stop(startTime + duration);

        startTime += duration * 0.7; // Slight overlap for smoother sound
      });
    },
    [enabled, volume, getAudioContext]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    play: playSound,
    playChime: () => playSound("chime"),
    playNotification: () => playSound("notification"),
    playSuccess: () => playSound("success"),
    playError: () => playSound("error"),
  };
}

export default useSound;
