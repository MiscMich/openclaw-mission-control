# API boundary

All Next.js API routes except `/api/auth` pass through `src/proxy.ts`. Browser requests require a valid signed session cookie and same-origin writes. Agent and worker requests require a configured `x-api-key` value of at least 32 characters.

Operational APIs are disabled in demo mode. Production authentication fails closed when secrets are missing.

Common integrations include:

- `/api/workflows/*` for workflow runs, leases, retries, and approval decisions
- `/api/agents/*` for agent state and check-ins
- `/api/messages` for authenticated agent messaging
- `/api/openclaw/file` and `/api/openclaw/files` for contained workspace access
- `/api/sessions/*` and `/api/system/control` for allowlisted local controls
- `/api/usage/ingest` for bounded usage events

Use `AGENT_API_KEY` only through environment configuration. Never put a real key in examples, source, URLs, or logs.
