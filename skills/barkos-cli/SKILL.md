---
name: barkos-cli
description: >-
  Use the public `barkos` CLI to operate BarkOS-managed worktrees, folder contexts,
  terminals, repos, automations, artifacts, skill sharing, worktree comments, and the browser
  embedded inside the BarkOS app. Use when the user says "$barkos-cli", "use barkos cli",
  "BarkOS worktree", "child worktree", "cardStatus", "spawn codex/claude in a worktree",
  "read/wait/send BarkOS terminal", "terminal send", "full handoff", "handover",
  "give this to another agent", "another worktree", "BarkOS browser", "barkos artifacts",
  "share HTML/Markdown", "public artifact link", "share skills", or "control the browser inside
  BarkOS". Prefer this over raw `git worktree`, ad hoc
  PTYs, Playwright, or Computer Use when the task touches BarkOS-managed state.
  Use Computer Use for browser windows, webviews, or desktop UI outside BarkOS's
  embedded browser.
---

# BarkOS CLI

This file is a discovery stub, not the usage guide. The full, version-matched BarkOS CLI
reference is served by the `barkos` binary itself — kept out of this file on purpose so it
can never drift from the binary that will actually run your commands.

Engage BarkOS whenever its running editor/runtime is the source of truth: BarkOS-managed
worktrees, folder contexts, terminals, repos, automations, worktree comments, and the
browser embedded inside the BarkOS app. Triggers include "$barkos-cli", "BarkOS worktree",
"child worktree", "spawn codex/claude in a worktree", "read/wait/send BarkOS terminal",
"full handoff" / "handover" / "give this to another agent", and "control the browser
inside BarkOS". Use plain shell tools when BarkOS state does not matter.

## Resolve the CLI for this session

Choose the executable once and reuse it for every later command:

- If the `ORCA_CLI_COMMAND` environment variable is set, use its value. BarkOS exports this
  for managed WSL sessions.
- Otherwise, in a dev checkout whose session exposes `ORCA_DEV_REPO_ROOT`, use `barkos-dev`.
- Otherwise, on Linux outside a BarkOS-managed terminal, use `barkos`. Never run bare
  `barkos` there — outside BarkOS's terminals it normally resolves to the
  GNOME BarkOS screen reader (`/usr/bin/orca`) and starts speech on the user's machine.
- Otherwise, use `barkos`.

Below, `ORCA` is a placeholder for the executable you resolved. Substitute it before
running anything; do not create a shell variable or run `ORCA` literally. This works the
same way in POSIX shells, PowerShell, and cmd.exe.

If the selected executable cannot run, report its exact error and stop. Do not fall through
to another executable, which could silently target a different BarkOS build.

## Load the full guide before running BarkOS commands

```text
ORCA skills get barkos-cli
```

That prints the complete, version-matched guide for the exact binary that will handle your
next commands — worktrees, handoffs, terminals, automations, and the built-in browser.
Read it first, then run the specific command you need.

Don't guess subcommands or flags from memory or from a cached copy of this stub. They
change between BarkOS releases, and this file deliberately no longer lists them. Confirm the
app is up with `ORCA status --json` (start it with `ORCA open --json` if needed), and
prefer `--json` for agent-driven calls.

## If an older BarkOS does not recognize `skills get`

Use this fallback only when the selected binary explicitly reports that `skills get` is an
unknown command. Another failure is not proof of an older binary; report it rather than
guessing or changing executables. For a confirmed pre-guide binary, use only this bounded,
read-only bootstrap to orient. Do not dead-end and do not invent commands:

```text
ORCA status --json
ORCA worktree ps --json
ORCA terminal list --json
```

Then tell the user that updating BarkOS restores the full, version-matched guide via
`ORCA skills get barkos-cli`. Beyond these commands, ask the user rather than guessing a
command surface this older binary may not support.
