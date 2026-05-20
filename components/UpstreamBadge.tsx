"use client";

import useSWR from "swr";

// Top-bar badge that surfaces upstream-API health. When api.normies.art is
// down (502 Ponder timeouts, as happens periodically), the rest of the city
// keeps working off the stale-while-error cache in lib/api-cache. This
// badge tells the user that data may be a few minutes behind reality so
// they don't think the app itself is broken.
//
// Only renders when the upstream is detected as down — invisible during
// normal operation so it doesn't add noise.

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface HealthInfo {
  upstream: "up" | "down" | "unknown";
  asOf: string;
  degraded: boolean;
}

export default function UpstreamBadge() {
  const { data } = useSWR<HealthInfo>("/api/health", fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });

  if (!data || !data.degraded) return null;

  return (
    <span
      className="flex items-center bg-off px-2.5 py-1.5 text-[10px] tracking-widest text-on"
      title={
        "api.normies.art is currently unavailable. The city is serving the " +
        "last-known-good data from cache. Live counters will resume " +
        "auto-updating as soon as the upstream recovers."
      }
    >
      <span className="mr-1">⚠</span>
      <span>DATA STALE · UPSTREAM DOWN</span>
    </span>
  );
}
