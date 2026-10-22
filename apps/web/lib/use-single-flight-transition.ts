"use client";
import { useCallback, useRef, useTransition } from "react";

/** A synchronous lock closes the gap before React commits disabled buttons. */
export function useSingleFlightTransition() {
  const [pending, transition] = useTransition();
  const inFlight = useRef(false);
  const start = useCallback((action: () => void | Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    transition(async () => {
      try { await action(); }
      finally { inFlight.current = false; }
    });
  }, []);
  return [pending, start] as const;
}
