# Security Policy

## Supported versions

Security fixes are applied to the latest release on the default branch. Older snapshots may not receive patches.

## Reporting a vulnerability

Please use the repository host's private security-reporting channel. Do not include credentials, tokens, private paths, customer data, or exploit details in a public issue. Include the affected version, reproduction steps, impact, and any suggested mitigation. Maintainers should acknowledge a complete report within seven days and coordinate disclosure after a fix is available.

## Deployment expectations

- Keep the service on loopback or behind a trusted authenticated reverse proxy.
- Treat this public release as demo-only; operational APIs are disabled even in production.
- Do not attempt to activate the retained live implementation with environment variables.
- If developing a future live adapter, configure Convex authentication and `OPENCLAW_WORKSPACE_ROOT` explicitly; there is no filesystem fallback.
- Do not mount home directories, credential stores, container sockets, or host roots into the application.
- Do not expose a separately deployed Convex backend until every client and server caller has a verified identity path.
- Review dependency advisories and rotate credentials after any suspected compromise.

## Security boundaries

The project defends its HTTP, session, file, webhook, and local process-control boundaries, but it cannot make untrusted agent output safe to execute. Operators remain responsible for OpenClaw tool policy, model-provider credentials, host permissions, and reverse-proxy configuration.
