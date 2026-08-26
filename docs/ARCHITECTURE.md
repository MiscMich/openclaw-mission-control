# Architecture

## Overview

OpenClaw Mission Control's public release has one runtime path: deterministic browser-memory fixtures with no external service. A retained live implementation is source reference only and cannot be activated by environment variables.

The demo is a real UI fallback, not a screenshot or a separate mock page. It exercises workflow runs, leases, retry budgets, approval decisions, audit events, monitoring transitions, and agent messaging.

## Layers

### Interface

The Next.js App Router renders the responsive dashboard. The demo component owns local fixture state. The build forces demo mode regardless of environment configuration.

### HTTP boundary

`src/proxy.ts` rejects operational API traffic with `403` in every environment. Retained session and API-key primitives are not an activation path.

Request helpers enforce JSON content types and byte limits before parsing. Individual routes then validate identifiers, enums, numeric ranges, and string lengths.

### Workflow runtime

The demo stores runs and events in browser memory. Retained live workflow invariants are centralized in `src/lib/workflows/invariants.ts`:

- a running step is controlled by one owner, attempt identifier, and unexpired lease;
- an expired running lease can be requeued;
- retries cannot exceed the configured budget;
- human steps become approval gates rather than ordinary agent work;
- meaningful state changes create attributable audit events.

Focused Vitest coverage locks these behaviors down independently of UI rendering.

### Local integration

OpenClaw access is server-side. Gateway and CLI arguments are passed as argument arrays rather than shell strings. Process controls allow only `start`, `stop`, and `restart` for the fixed `workers` and `bridge` targets, and their callback URL must use HTTP on loopback.

### Filesystem boundary

File APIs require `OPENCLAW_WORKSPACE_ROOT`. Paths are resolved from the canonical root, absolute and parent paths are rejected, existing components are checked for symbolic links, and common credential/key files are denied. File sizes and directory-list sizes are bounded.

## Data flow

```text
Demo
Browser action → local reducer/state → visible run/message/event update

Retained live code (disabled)
request → 403 before route execution
Convex query/mutation → authenticated identity required
```

## Failure behavior

- Operational APIs return `403`; there is no public-release live mode or default password.
- Convex configuration does not affect the demo build or demo UI.
- Missing workspace configuration closes file APIs.
- Demo mode closes operational APIs.
- Retries end in failure once the configured retry budget is consumed.
- Approval-gated steps do not advance without an explicit operator decision.
