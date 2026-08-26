const url =
  process.env.STANDUP_URL ?? "http://localhost:3000/api/standups/generate";
const time = process.env.STANDUP_TIME ?? "23:30";
const apiKey = process.env.AGENT_API_KEY?.trim();

const [hourStr, minStr] = time.split(":");
const targetHour = Number(hourStr ?? "23");
const targetMinute = Number(minStr ?? "30");
let lastRunDate = "";

async function runStandup(date) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) },
      body: JSON.stringify({ date }),
    });
    const data = await res.json();
    if (!data.ok) {
      process.stderr.write(`[standup] failed: ${data.error}\n`);
      return;
    }
    process.stdout.write(`[standup] generated for ${date}\n`);
  } catch (err) {
    process.stderr.write(
      `[standup] error: ${err instanceof Error ? err.message : "unknown"}\n`
    );
  }
}

function check() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  if (lastRunDate === dateStr) return;
  if (now.getHours() === targetHour && now.getMinutes() === targetMinute) {
    lastRunDate = dateStr;
    runStandup(dateStr);
  }
}

process.stdout.write(`[standup] worker scheduled for ${time}\n`);
setInterval(check, 60 * 1000);
check();
