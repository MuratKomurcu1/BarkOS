<h1 align="center">
  <img src="resources/build/icon.png" alt="BarkOS" width="96" />
  <br />
  BarkOS
</h1>

<p align="center">
  <strong>Your local-first AI software company.</strong><br />
  Describe the outcome. BarkOS reads the project, builds the team, divides the work, and keeps every agent visible.
</p>

<p align="center">
  <a href="https://github.com/MuratKomurcu1/BarkOS/stargazers"><img src="https://img.shields.io/github/stars/MuratKomurcu1/BarkOS?style=flat&color=06b6d4" alt="GitHub stars" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-06b6d4" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/status-preview-f59e0b" alt="Preview status" />
  <img src="https://img.shields.io/badge/macOS-Apple%20Silicon-111827?logo=apple" alt="macOS Apple Silicon" />
</p>

> [!IMPORTANT]
> BarkOS is an early preview. It can run tools and modify files with the permissions you grant. Use Git, review high-risk actions, and keep important work backed up.

## Why BarkOS

Most agent tools give you another chat window. BarkOS gives you an operating company:

- **Codex lead agent** interprets the objective, makes staffing decisions, and owns the final result.
- **Project reader** maps the repository before work begins and turns findings into an executable plan.
- **Claude and OpenCode specialists** are assigned per task for deep review, refactors, parallel implementation, or provider fallback.
- **Live pixel office** represents real agent sessions and their current state instead of decorative animation.
- **Isolated workspaces** let agents work in parallel without trampling the same files.
- **Audited decisions and permission gates** keep provider choice below user authority.
- **Turkish-first desktop experience** makes the full workflow understandable without terminal knowledge.

## How it works

```text
Your objective or existing project
              │
              ▼
        Project reader
              │ repository map + constraints
              ▼
        Codex lead agent
              │ staffing plan
       ┌──────┼─────────┐
       ▼      ▼         ▼
    Codex   Claude   OpenCode
       └──────┼─────────┘
              ▼
    Review, evidence, delivery
```

The lead selects the provider for each worker, but never gains more filesystem, shell, browser, or network authority than the user granted.

## Current provider policy

| Provider | Default role |
| --- | --- |
| Codex | Lead agent, general implementation, coordination, final decision |
| Claude Code | Deep review, large refactors, architecture, documentation |
| OpenCode | Independent parallel implementation and provider fallback |

Provider assignments are recorded in the staffing plan. Users can still add or remove workers, and risk controls remain authoritative.

## Install the preview

Download the newest macOS DMG from [Releases](https://github.com/MuratKomurcu1/BarkOS/releases), open it, and drag BarkOS into Applications.

The current preview is not notarized. On macOS, right-click BarkOS and choose **Open** on first launch if Gatekeeper asks for confirmation.

### Agent CLIs

BarkOS discovers supported agents from your `PATH`. Sign in to the providers you want to use:

```bash
# Codex
curl -fsSL https://chatgpt.com/codex/install.sh | sh
codex

# Claude Code
npm install -g @anthropic-ai/claude-code
claude

# OpenCode
opencode
```

Provider subscriptions, API usage, and rate limits belong to their respective providers; BarkOS does not bundle paid model access.

## Build from source

Requirements: Node.js 24, pnpm, Git, and macOS for a macOS package.

```bash
git clone https://github.com/MuratKomurcu1/BarkOS.git
cd BarkOS
corepack enable
pnpm install
pnpm dev
```

Build a local macOS DMG:

```bash
pnpm build:mac
```

## Roadmap

- Stabilize autonomous project intake and evidence-based completion
- Expand the pixel office with richer real-session movement and collaboration
- Finish the BarkOS mobile companion and independent pairing service
- Add signed and notarized macOS releases
- Harden Windows and Linux installers
- Add configurable provider routing, budgets, and local-model adapters

## Contributing

Issues, ideas, and pull requests are welcome. Start with the [contribution guide](.github/CONTRIBUTING.md) and read the [security policy](SECURITY.md) before reporting a vulnerability.

## License and acknowledgements

BarkOS is free and open source under the [MIT License](LICENSE).

BarkOS is an independent fork built from the MIT-licensed [Orca](https://github.com/stablyai/orca) codebase and incorporates MIT-licensed concepts/assets from [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents). BarkOS is not affiliated with Muratify. See [NOTICE-BARKOS.md](NOTICE-BARKOS.md) for complete attribution.

---

<p align="center">
  Built by <a href="https://muratkomurcu.com">Murat Kömürcü</a> and the BarkOS contributors.
</p>
