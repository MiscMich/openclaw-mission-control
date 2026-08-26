# Repository Agent Guide

## Development

- Use pnpm and keep a single `pnpm-lock.yaml`.
- Run `pnpm test:run`, `pnpm typecheck`, and `pnpm build` before handing off changes.
- Add focused regression tests before implementing new security behavior.
- Keep demo fixtures deterministic, neutral, and free of credentials or personal data.

## UI verification

- Use `agent-browser` for end-to-end UI checks.
- Verify desktop and mobile widths.
- Exercise primary actions and capture screenshots only as local test evidence.
- Check for horizontal page scrolling, clipped dialogs, console errors, and unclear copy.

## Security

- Keep authentication, file, webhook, and process-control boundaries fail closed.
- Do not add default passwords, public bind defaults, shell-interpolated commands, or filesystem fallbacks outside the configured root.
- Never commit environment files, credentials, local paths, production identifiers, or operational screenshots.
