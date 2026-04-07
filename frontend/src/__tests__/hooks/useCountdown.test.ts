import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountdown } from '@/hooks/useCountdown';

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with initial value and not running', () => {
    const { result } = renderHook(() => useCountdown(3));
    expect(result.current.count).toBe(3);
    expect(result.current.isRunning).toBe(false);
  });

  it('starts countdown when start is called', () => {
    const { result } = renderHook(() => useCountdown(3));

    act(() => {
      result.current.start();
    });

    expect(result.current.isRunning).toBe(true);
    expect(result.current.count).toBe(3);
  });

  it('decrements count each second', () => {
    const { result } = renderHook(() => useCountdown(3));

    act(() => {
      result.current.start();
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.count).toBe(2);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.count).toBe(1);
  });

  it('stops at zero', () => {
    const { result } = renderHook(() => useCountdown(2));

    act(() => {
      result.current.start();
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.count).toBe(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.count).toBe(0);
    expect(result.current.isRunning).toBe(false);
  });

  it('resets to initial value', () => {
    const { result } = renderHook(() => useCountdown(3));

    act(() => {
      result.current.start();
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.count).toBe(3);
    expect(result.current.isRunning).toBe(false);
  });

  it('accepts custom start value', () => {
    const { result } = renderHook(() => useCountdown(3));

    act(() => {
      result.current.start(5);
    });

    expect(result.current.count).toBe(5);
    expect(result.current.isRunning).toBe(true);
  });
});
