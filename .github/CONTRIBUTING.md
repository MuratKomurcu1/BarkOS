# Contributing to BarkOS

Thank you for helping build a local-first AI company operating system.

## Before you start

- Search existing issues before opening a new one.
- Keep changes focused and explain the user-facing outcome.
- Do not weaken permission gates, audit records, workspace isolation, or provider boundaries.
- Keep agent behavior provider-neutral unless a capability is explicitly provider-specific.
- Preserve local, folder-workspace, Git worktree, SSH, macOS, Windows, and Linux behavior.
- Follow [`docs/STYLEGUIDE.md`](../docs/STYLEGUIDE.md) for every UI change.
- Keep original MIT notices and third-party attribution intact.

## Local setup

```bash
corepack enable
pnpm install
pnpm dev
```

Node.js 24 is the supported development runtime.

## Pull requests

1. Create a descriptive branch such as `feat/provider-routing` or `fix/office-session-state`.
2. Add tests that fail without the behavior you implemented.
3. Run the relevant checks:

   ```bash
   pnpm typecheck
   pnpm test
   pnpm lint
   ```

4. Include before/after media for UI work.
5. Describe security, performance, provider, remote/SSH, and cross-platform effects.

Never commit API keys, access tokens, account data, private repositories, build products, or local BarkOS state.

## Release process

Releases are maintainer-managed. Do not change versions, tags, signing settings, or release workflows unless a maintainer requests it.
