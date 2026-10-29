"use client";

import { useEffect, useState } from "react";

// Keep date-dependent summaries coherent and refresh them while the app stays open.
export function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
