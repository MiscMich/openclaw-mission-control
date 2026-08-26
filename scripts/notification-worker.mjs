const url =
  process.env.NOTIFICATION_DELIVER_URL ??
  "http://localhost:3000/api/notifications/deliver";
const interval = Number(process.env.NOTIFICATION_POLL_INTERVAL_MS ?? 2000);
const apiKey = process.env.AGENT_API_KEY?.trim();

async function tick() {
  try {
    const res = await fetch(url, { method: "POST", headers: apiKey ? { "x-api-key": apiKey } : undefined });
    const data = await res.json();
    if (data?.delivered) {
      process.stdout.write(
        `[notify] delivered ${data.delivered} notifications\n`
      );
    }
  } catch (err) {
    process.stderr.write(
      `[notify] error: ${err instanceof Error ? err.message : "unknown"}\n`
    );
  }
}

process.stdout.write(`[notify] worker started (${url})\n`);
setInterval(tick, interval);
tick();
