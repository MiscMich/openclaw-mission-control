module.exports = {
  apps: [
    {
      name: "openclaw-mission-control-workers",
      cwd: __dirname,
      script: "node",
      args: "scripts/workers.mjs",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 2000,
      env: {
        NOTIFICATION_DELIVER_URL:
          process.env.NOTIFICATION_DELIVER_URL ??
          "http://localhost:3000/api/notifications/deliver",
        STANDUP_URL:
          process.env.STANDUP_URL ?? "http://localhost:3000/api/standups/generate",
        USAGE_INGEST_URL:
          process.env.USAGE_INGEST_URL ?? "http://localhost:3000/api/usage/ingest",
      },
    },
  ],
};
