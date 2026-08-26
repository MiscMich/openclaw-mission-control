export function heartbeatIntervalMinutesFromPoll(): number {
  const pollMs = Number(process.env.POLL_INTERVAL_MS ?? 30_000);
  if (!Number.isFinite(pollMs) || pollMs <= 0) return 1;
  return Math.max(1, Math.round(pollMs / 60_000));
}
