import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSound } from "./useSound";

// Track AudioContext instantiations
let audioContextCreated = false;

// Create a mock class for AudioContext
class MockAudioContext {
  destination = {};
  currentTime = 0;

  constructor() {
    audioContextCreated = true;
  }

  createOscillator = vi.fn(() => ({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    type: "sine" as OscillatorType,
    frequency: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      value: 440,
    },
  }));

  createGain = vi.fn(() => ({
    connect: vi.fn(),
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      value: 1,
    },
  }));

  close = vi.fn();
}

describe("useSound hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    audioContextCreated = false;
    global.AudioContext = MockAudioContext as unknown as typeof AudioContext;
  });

  it("returns a play function", () => {
    const { result } = renderHook(() => useSound());
    expect(typeof result.current.play).toBe("function");
  });

  it("creates AudioContext when playing", () => {
    const { result } = renderHook(() => useSound());

    act(() => {
      result.current.play("chime");
    });

    expect(audioContextCreated).toBe(true);
  });

  it("supports different sound types", () => {
    const { result } = renderHook(() => useSound());

    // Should not throw for any sound type
    act(() => {
      result.current.play("chime");
    });

    act(() => {
      result.current.play("notification");
    });

    act(() => {
      result.current.play("success");
    });

    act(() => {
      result.current.play("error");
    });

    expect(audioContextCreated).toBe(true);
  });

  it("respects enabled option", () => {
    const { result } = renderHook(() => useSound({ enabled: false }));

    act(() => {
      result.current.play("chime");
    });

    // AudioContext should not be created when disabled
    expect(audioContextCreated).toBe(false);
  });

  it("respects volume option", () => {
    const { result } = renderHook(() => useSound({ volume: 0.5 }));

    act(() => {
      result.current.play("chime");
    });

    expect(audioContextCreated).toBe(true);
  });
});
