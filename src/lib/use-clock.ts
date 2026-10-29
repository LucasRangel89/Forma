"use client";

import { useEffect, useState } from "react";

// Keep date-dependent summaries coherent and refresh them while the app stays open.
export function useClock(refreshKey?: unknown): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // A newly saved session may be newer than the last minute tick. Refresh
    // when its history changes as well, without admitting future-dated logs.
    const refresh = window.setTimeout(() => setNow(new Date()), 0);
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => { window.clearTimeout(refresh); window.clearInterval(timer); };
  }, [refreshKey]);
  return now;
}
