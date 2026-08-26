"use client";

import { useMemo } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const client = useMemo(
    () => new ConvexReactClient(demoMode ? "http://127.0.0.1:1" : requireLiveUrl(url)),
    [demoMode, url]
  );
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}

function requireLiveUrl(url: string | undefined): string {
  if (!url) throw new Error("Live Convex mode is unavailable in this public release");
  return url;
}
