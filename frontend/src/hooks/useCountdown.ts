import { useState, useEffect, useCallback, useRef } from 'react';

interface UseCountdownReturn {
  count: number;
  isRunning: boolean;
  start: (from?: number) => void;
  reset: () => void;
}

export function useCountdown(initialSeconds = 3): UseCountdownReturn {
  const [count, setCount] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const start = useCallback((from?: number) => {
    const startValue = from ?? initialSeconds;
    setCount(startValue);
    setIsRunning(true);
  }, [initialSeconds]);

  const reset = useCallback(() => {
    stop();
    setCount(initialSeconds);
  }, [initialSeconds, stop]);

  useEffect(() => {
    if (!isRunning) return;

    intervalRef.current = setInterval(() => {
      setCount((prev) => {
        if (prev <= 1) {
          stop();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, stop]);

  return { count, isRunning, start, reset };
}
