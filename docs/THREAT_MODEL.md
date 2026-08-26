# Threat Model

## Assets

- Operator session and API credentials
- Convex workflow, message, and audit data
- OpenClaw gateway token and local agent sessions
- Files under the configured workspace root
- Host processes managed by the worker controls

## Trust boundaries

The browser, API clients, model/agent output, Convex, the OpenClaw gateway, local files, and local processes are separate trust domains. Model output is untrusted data even when it comes from a configured agent.

## Primary threats and mitigations

| Threat | Mitigation |
| --- | --- |
| Default or missing credentials | No bundled password/hash; production fails closed; secrets have minimum lengths |
| Session forgery or replay | HMAC-signed random session tokens, fixed expiry, HTTP-only strict cookies, secure flag in production |
| API or webhook spoofing | Central API authentication, constant-time API keys, bounded bodies, route-level validation |
| Directory traversal | Canonical configured root, absolute/parent rejection, containment checks |
| Symlink escape | Every existing path component is checked; symbolic links are rejected |
| Secret-file disclosure | Common environment, credential, token, key, and repository metadata paths are denied |
| Oversized input or output | Request, file, field, directory, and list limits |
| Command injection | Fixed executables and argument arrays with `shell: false`; fixed control targets/actions |
| Remote-control exposure | Loopback callback validation and localhost-only development origins |
| Lease theft or stale completion | Owner, attempt identifier, status, and expiry validation |
| Infinite retry loops | Explicit maximum retry count with exhaustion behavior |
| Approval bypass | Human steps use a distinct state and require an explicit operator decision |
| Audit ambiguity | State-changing workflow actions append typed actor/time events |
| Demo affecting live systems | Demo is the only runtime and rejects operational API requests in every environment |
| Direct Convex calls bypassing app auth | Every public query and mutation requires `ctx.auth.getUserIdentity()` through shared wrappers |

## Out of scope

- A fully compromised host or browser
- Malicious dependencies executing during installation
- OpenClaw or Convex vulnerabilities outside this repository
- Unsafe tools deliberately granted to agents
- A reverse proxy that forwards unauthenticated public traffic contrary to the deployment guidance

## Residual risk

An authenticated operator can intentionally alter workflows, files within the configured root, or managed processes. The application reduces accidental scope and injection risk; it does not replace host-level least privilege, backups, credential rotation, or OpenClaw tool policy.
