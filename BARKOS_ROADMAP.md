# BarkOS roadmap

## Product promise

Give one person a persistent, inspectable AI company: name the workers, define
their responsibilities, delegate an objective, watch real execution, and accept
only work backed by evidence.

## Guiding constraints

- Local-first and offline-capable for core development workflows.
- Open, provider-neutral execution through Orca's CLI-agent model.
- No hidden autonomous writes: destructive or external actions require policy
  and an auditable decision.
- Existing Orca worktree, SSH, folder-workspace, mobile, and review workflows
  must remain functional.
- BarkOS branding and infrastructure must remain independently owned.

## Milestones

### M0 — Fork foundation

- Establish the BarkOS branch, product notice, toolchain, and architecture.
- Generate macOS, Windows, Linux, and runtime app icons from the approved BarkOS
  master artwork.
- Preserve Orca's MIT notice and document compatibility seams.
- Disable accidental publication to upstream product channels before packaging.
- Prove clean typecheck and focused tests on Node 24 / pnpm 10.24.

Exit: the fork builds reproducibly without changing the user's global Node 26
installation.

Local macOS arm64 packaging proof is complete: an ad-hoc-signed BarkOS DMG and
ZIP pass bundle identity, architecture, CLI, codesign, and disk-image integrity
checks. Developer ID signing and notarization remain in M8.

### M1 — Company kernel

- Versioned `Company`, `Role`, and `Worker` contracts.
- Local persistence with migrations and bounded snapshots.
- Create, edit, archive, import, and export a roster.
- Bind a persistent worker identity to temporary Orca agent sessions.

Exit: a user can create a company and launch a named worker into a local, folder,
worktree, SSH, or paired-runtime execution target.

### M2 — Delegation and evidence

- Leader converts an objective into a dependency-aware plan.
- Capability and load-aware assignment policy.
- Orca orchestration dispatch adapter with bounded retries.
- Evidence manifest: tests, changed files, diff, terminal excerpts, screenshots,
  risks, and unresolved decisions.
- Approval gates and explicit escalation paths.

Exit: one objective can be delegated to multiple workers and reviewed from a
single evidence-backed board.

### M3 — Memory system

- Company, role, worker, project, and task memory scopes.
- Promotion workflow instead of silent long-term memory writes.
- Source, timestamp, confidence, expiry, and contradiction tracking.
- Inject only relevant memory within a measured context budget.

Exit: worker identity persists across providers without leaking unrelated
project context.

### M4 — Provider capacity and failover

- Read real provider usage and retry/reset signals.
- Account health ledger, tried chain, attempt ceiling, and cooldowns.
- Resume the same provider conversation when the provider supports it.
- Never export tokens, cookies, or credentials through BarkOS sync.

Exit: a rate-limited task either resumes safely on an eligible account or stops
with a precise, actionable reason.

### M5 — Office and control plane

- Company roster, live office, task board, worker detail, and evidence review.
- Explain why a task was assigned and what it cost.
- Human approvals, kill switch, pause, resume, and reassignment.
- Accessibility, keyboard operation, and compact/non-animated views.

Exit: the complete objective-to-evidence flow is usable without opening raw
terminal management screens.

### M6 — Private mobile control

- Revocable device pairing and least-privilege capability grants.
- Notifications, voice tasks, attachments, approvals, pause, and stop.
- Private-network mode with explicit listening interfaces.
- No remote file deletion or computer control without a separate grant.

Exit: a phone can safely supervise active work without exposing the runtime to
the public internet.

### M7 — Voice, capture, and integrations

- Turkish-first local dictation plus multilingual model packs.
- Cursor injection as an optional, permission-scoped companion.
- Screenshot, DOM, video, and file capture into task context.
- Git providers plus scoped Supabase, Sentry, Stripe, PostHog, and deployment
  integrations.

Exit: common founder workflows can be delegated without copying context across
applications by hand.

### M8 — Production hardening

- Signing, notarization, BarkOS update channels, crash recovery, and migrations.
- Privacy controls, telemetry opt-in, security review, and dependency audit.
- Idle, startup, memory, terminal-scale, and multi-agent performance budgets.
- Automated upstream-Orca merge checks.

Exit: signed macOS, Windows, and Linux releases with rollback and migration
evidence.

## First implementation slice

- [x] Add strict, versioned company/role/worker contracts.
- [x] Test referential integrity and bounded input.
- [x] Add bounded, private local snapshot persistence.
- [x] Expose read/write methods through a trusted-renderer main-process adapter.
- [x] Build the first company creation and roster screen.
- [x] Add explicit snapshot migrations before the schema changes.
- [x] Add roster editing, archive, import, and export.
- [x] Bind named workers to launchable Orca execution sessions.
- [x] Persist exact worker workspace/host/session bindings and recover them
      safely after application reload.

The completed foundation is intentionally idle until BarkOS is launched. It
adds no login item, daemon, browser extension, scheduled job, or background
service to normal system use.

## 0.2.0-preview.4 release slice

- [x] Add an opt-in “Hey BarkOS” desktop assistant with continuous wake-phrase
      listening and everyday conversation through the selected local CLI agent.
- [x] Route project and code requests into the BarkOS company workflow while
      keeping sensitive actions behind explicit confirmation.
- [x] Add Turkish offline speech endpointing and a stable Turkish system voice.
- [x] Improve LAN pairing QR readability and remove misleading public-store
      links until a BarkOS-owned mobile build is available.
- [x] Gate cross-platform releases on voice, mobile, live-office, orchestration,
      type, and localization checks.
- [x] Publish prerelease tags as GitHub prereleases and target only the BarkOS
      repository.

## M2 implementation slice

- [x] Add strict, versioned objective, plan, task, assignment, dispatch,
      evidence, and approval contracts.
- [x] Enforce dependency DAG, referential integrity, bounded retry, approval,
      and evidence-backed completion invariants.
- [x] Add deterministic capability, load, availability, and environment-aware
      worker selection with explainable failure reasons.
- [x] Persist and migrate the work ledger through the trusted main-process
      boundary.
- [x] Map BarkOS objectives, tasks, and dispatch attempts onto existing Orca
      orchestration RPC methods.
- [x] Accept bounded runtime/git/test completion manifests and expose explicit
      acceptance review.
- [x] Build the first objective and evidence board UI.
- [x] Wire bounded read-only terminal and cached Git snapshots, plus explicit
      test-result recording, into completion submission.
- [x] Run validation-shaped test commands only after an explicit user action,
      revalidate the exact active Dispatch/workspace/host in the main process,
      and capture redacted, time/output-bounded results without a shell.
- [x] Pin paired-runtime capability and runtime identity on the same dedicated
      E2EE request socket, with real transport coverage for missing capability,
      client cancellation, disconnect, and host restart before command send.
- [x] Refresh the exact bound workspace's Git status on evidence collection,
      with cancellable local/SSH/runtime routing and a labeled cached fallback.
- [x] Attach explicitly selected raster screenshots as validated, hashed,
      content-addressed local evidence assets without screen capture permission.
- [x] Build the objective planner UI with dependency and dispatch-approval policy.
- [x] Add resumable Orca plan preparation, explainable worker assignment, and
      explicit protected-dispatch/start controls to the objective board.
- [x] Review the agent's effective provider permission mode and exact task
      boundary before launch or dispatch.
- [x] Prepare, assign, and start eligible low/medium-risk work from one user
      action; require an explicit gate for every high/critical-risk dispatch.
- [x] Require a recognized live terminal before dispatch, and relaunch only the
      worker's exact persisted eligible target when recovery is safe.
- [x] Ingest Orca questions, decision gates, and escalations into a bounded,
      company-scoped decision inbox with exact Task/Dispatch/worker/risk links.
- [x] Resolve the current Run's request through audited two-phase persistence,
      with no blind retry after an ambiguous reply or interrupted application.
- [x] Show a Decisions workspace with one-click options, explicit approval,
      rejection, free-form response, historical receipts, and uncertain-state
      recovery.

The current M2 slice defines and tests the safe delegation state machine, the
explicit runtime adapter, persistent renderer ledger state, and the first
evidence-backed board. A user can now prepare an approved plan in Orca, assign
each ready Task with a recorded policy rationale and send its exact specification
to the selected live agent. “Assign and start” now prepares an unbound Orca plan,
selects the worker, and dispatches eligible low/medium-risk work as one explicit
user action. High and critical risk always stop at a persisted authority gate;
approving that gate dispatches the task immediately. Questions, decision gates,
and escalations from the lead worker's current Run now enter a separate audited
decision inbox and can be answered without taking authority from another Run.
Ambiguous responses are never retried automatically. While the Company page is
open, a read-only ten-second poll runs only for active dispatches; it stops with
the page and consumes no provider quota. No login item, daemon, scheduled job,
or application-closed process was added. A running dispatch can now collect its
exact worker terminal tail and fresh Git changes—or a visibly labeled cached
fallback—combine them with explicitly recorded test results and review notes,
then submit the bounded manifest for acceptance. A user can also choose existing
PNG, JPEG, GIF, or WebP screenshots; BarkOS validates, hashes, and copies them to
private managed storage for review without capturing the screen. Git status and
terminal reads run in parallel only after the user opens evidence collection.
User-approved test execution now works for exact local, WSL, and direct SSH
worker bindings. It rejects shell composition and write/update flags, cancels
with the evidence dialog, and returns only a redacted bounded result. Paired
runtime execution is now capability-negotiated and revalidates the authenticated
owner, live PTY incarnation, active Orca Dispatch, exact tab/workspace root,
pairing revision, and runtime identity on the host. It re-parses the allowlisted
command, uses the same five-minute/64 KiB/redaction bounds, and runs over a
dedicated E2EE request socket so capability preflight and command cannot cross a
host-restart boundary and cancellation reaches the host process. Real E2EE
transport tests prove missing capability prevents command send, disconnect
aborts host execution, and restart after preflight leaves the command unsent.
Older hosts and nested SSH/WSL workspaces remain fail-closed with manual evidence.
Worker sessions now survive application reload in a separate versioned private
snapshot. The board shows ready, waiting, relaunch-required, and unconfirmed
remote states. Starting work verifies the exact stored tab/workspace/host
identity; a missing local or paired-runtime tab can be relaunched only on that
same currently eligible target, while an uncertain remote request requires
human verification to avoid duplicating a possible side effect.

## M3 implementation slice

- [x] Add a strict, versioned, bounded memory vault with company, role, worker,
      project, and task scopes.
- [x] Record accepted-evidence provenance, timestamps, confidence, expiry,
      revocation, and same-scope contradiction lineage.
- [x] Reconcile accepted evidence into idempotent promotion candidates without
      silently creating active memory.
- [x] Add explicit promote, reject, and revoke actions in a Memory workspace.
- [x] Persist the vault through trusted IPC with company-generation isolation,
      optimistic revisions, private durable files, and browser-local parity.
- [x] Inject only active, unexpired, relevant, credential-filtered memory into
      explicit worker-launch briefings within a measured context budget.
- [x] Deliver task-scoped memory at the exact Orca Dispatch boundary with a
      durable, idempotent delivery receipt before claiming task injection.
- [x] Add a proposal editor for scope, expiry, confidence, and explicit
      contradiction selection.
- [x] Extend BarkOS backup/import export to include the independently versioned
      memory vault without exporting credentials.

M3 is complete. Worker launch and task dispatch select only relevant approved
memory for the exact worker/workspace/task chain under separate measured
budgets. Dispatch persists a deterministic content-hash receipt before the
effect and reports old-host delivery as unconfirmed instead of claiming it.
Proposal scope and contradiction choices remain provenance-bound. Versioned
backup bundles carry company plus memory, reject credential-like content, and
continue to import legacy company-only JSON. The feature remains idle while the
application is closed and adds no background memory process or new stream
opcode.

## M4 implementation slice

- [x] Add a strict, versioned provider-capacity ledger without tokens, cookies,
      account email addresses, or provider conversation content.
- [x] Normalize Orca account and usage snapshots into available, limited,
      cooldown, unavailable, and fail-closed unknown states.
- [x] Bind every account observation to its exact provider, execution host, and
      host/WSL runtime lane; never substitute local usage for a remote owner.
- [x] Define a deterministic failover selector with a three-attempt ceiling,
      tried-account exclusion, cooldown wake times, stable ordering, and precise
      stop reasons.
- [x] Define failover audit transitions that freeze on ambiguous side effects
      and reject mismatched outcome/reason pairs.
- [x] Persist capacity snapshots through trusted desktop IPC and versioned
      browser-local storage with company-generation and optimistic-revision
      isolation.
- [x] Add a Capacity workspace with explicit, user-triggered Orca snapshot sync
      and honest unknown/stale/error states.
- [x] Integrate an explicit local-host Codex account mutation only after
      revalidating the Task, Assignment, Dispatch, worker session, provider,
      execution host, runtime lane, settled turn, and authoritative limit.
- [x] Resume the exact trusted Codex rollout through a hard-linked managed
      account home when provenance is verified; otherwise start and record a
      new session.
- [x] Persist selection before account mutation, recover interrupted selections
      as uncertain, and stop permanently after any ambiguous possible effect.
- [x] Prove the old Orca Dispatch and PTY are stopped before launching a
      replacement, then persist the replacement Dispatch authority.
- [x] Expose eligible recovery and its durable history as a manual desktop-only
      action; never switch an account merely because the page is open.
- [x] Recognize an exact settled, still-dispatched local Codex task and let the
      user run a targeted current-state recovery check without first using the
      generic snapshot-sync action.
- [x] Detect authoritative rate-limit failures from live task execution and
      distinguish them from other settled-turn outcomes without parsing free
      text.
- [x] Prove the complete disposable-account recovery chain through the real
      Electron renderer, IPC, main-process, and durable-ledger boundaries.
- [x] Fault-inject missing account read-back, uncertain Dispatch stop, unproven
      PTY termination, and work-ledger persistence failure; freeze every
      possible side effect without starting another writer.
- [x] Relaunch Electron against the same isolated user data and recover a
      durable interrupted `selected` attempt as uncertain without replaying it.
- [ ] Extend mutation/resume capabilities beyond local-host Codex to supported
      providers, SSH, WSL, and paired runtimes only with equivalent evidence.

The manual local-host Codex M4 slice now includes its authoritative live failure
cause. A bounded incremental rollout watcher correlates the hook's exact
`turn_id` with Codex's structured `task_complete.error.codex_error_info` and
publishes only `usage-limit-exceeded`; prose never qualifies. Snapshot sync and
the targeted recovery check remain read-only, and recovery still requires an
explicit user click. It re-reads the current roster and usage snapshot before
recording selection, mutating and separately reading back the exact managed account,
stopping the old Dispatch and PTY, launching a verified resume or new session,
and binding the replacement Dispatch. No automatic account switch or provider
refresh was added. The complete chain, its four ambiguous-side-effect barriers,
and interrupted-selection restart recovery are covered at the real Electron
boundary. Non-local/provider capability expansion remains future work.

## M5 implementation slice

- [x] Add a strict v1 control policy tied to the exact Company generation with
      optimistic revision protection and bounded values.
- [x] Persist desktop controls in a durable owner-only main-process store and
      paired web controls in versioned client-local storage.
- [x] Add a Control workspace for running/paused state, active Dispatch count,
      per-client concurrency, per-worker active Assignments, and per-Objective
      Dispatch budget.
- [x] Load the current durable policy before new Assignment and protected-work
      approval mutations.
- [x] Recheck pause, concurrency, Objective budget, and scope immediately before
      Dispatch prepare/persistence/RPC.
- [x] Block manual Codex recovery before any worker-session, account, Dispatch,
      or terminal mutation while execution is paused.
- [x] State explicitly that pause blocks only new work started from this client
      and does not terminate existing agents or terminals.
- [x] Prove settings, revision, pause, and reload persistence through the real
      Electron renderer, preload IPC, main-process, and durable-store boundary.
- [x] Add an authoritative stop/kill control for already-running work with exact
      Dispatch and PTY settlement evidence.
- [x] Add confirmed-stop reassignment that excludes the stopped worker,
      persists a new Assignment before launch, and creates a fresh authority
      gate for protected work.
- [x] Add a read-only Live Office that joins durable work with exact in-memory
      agent hook state without provider polling or background execution.
- [x] Add provider-derived token and monetary cost accounting; the current
      per-Objective limit is an execution-unit budget, not a cost estimate.
- [x] Extend usage/cost accounting to native Claude/Codex work on paired
      runtimes through an additive capability, authenticated host ownership,
      and aggregate-only evidence; keep old hosts and nested SSH/WSL fail-closed.
- [x] Add compact/non-animated office modes and complete keyboard/accessibility
      verification.
- [x] Add a top-down animated office floor driven only by real worker,
      Dispatch, and hook state; preserve reduced-motion and no-animation modes.
- [x] Replace visible Orca branding across native titles, the macOS status
      menu, notifications, and locale catalogs with BarkOS.
- [x] Add Turkish locale selection and translate the native menu, primary app
      shell, company setup, roster, and live-office surfaces.
- [ ] Complete and review the remaining Turkish catalog before claiming a
      fully Turkish application.
- [x] Enforce destructive, external, and budgeted actions at the real local
      Claude and Codex `PreToolUse` boundaries with exact one-shot approvals.
- [x] Extend the same fail-closed boundary to direct SSH and WSL with a
      versioned relay request, exact transport/Dispatch identity, and
      pre-spawn managed-hook capability proof.
- [x] Extend the boundary to paired runtimes with an authenticated owner-only
      E2EE decision channel and exact live PTY/Dispatch identity evidence.
- [x] Extend the native-host boundary to Factory Droid through its blocking
      `PreToolUse` contract, exact managed-hook readiness, and
      Factory-compatible allow/deny responses.
- [x] Extend Factory Droid to direct SSH and WSL through the versioned relay
      request, exact transport/Dispatch identity, and pre-spawn proof of the
      current remote managed hook.
- [x] Extend Factory Droid to paired runtimes through an additive v2 provider
      capability, owner-authenticated decision stream, exact live PTY/Dispatch
      proof, and host-side managed-hook readiness.
- [x] Extend Gemini to native host, direct SSH, and WSL through its blocking
      `BeforeTool` contract, provider-specific allow/deny response, exact
      Dispatch identity, and pre-spawn managed-hook readiness.
- [x] Extend Gemini to paired runtimes through an additive v3 capability,
      separate owner-authenticated RPC endpoints, provider-specific decisions,
      and host-side managed-hook readiness.
- [ ] Extend the boundary to other providers only where equivalent
      pre-execution hook and identity evidence exist.

The M5 control plane is client/host scoped, not a global company lock.
The policy is deliberately excluded from Company backup so importing a Company
cannot import another host's authority or hardware concurrency. Work-ledger
optimistic persistence serializes concurrent prepares before any Dispatch RPC.
Existing running work now has an explicit destructive stop action: BarkOS
persists intent, proves the exact Orca Dispatch stopped, proves the exact worker
PTY was killed, and only then cancels the Dispatch, Task, and active Assignment.
Only that completed boundary can be reassigned. The old Assignment becomes
auditable `reassigned` history, a different eligible worker receives a new
durable Assignment, and protected work waits at a fresh gate. Live Office shows
current work and exact hook activity, but labels missing runtime proof as
unconfirmed. Ambiguous effects remain durably uncertain and cannot be retried.
Usage & cost stores a separate desktop-local ledger. Local work is measured
from the desktop's provider stores; paired-runtime native work is measured only
by the authenticated execution host after exact finished Dispatch, live PTY,
process, launch-token, owner, provider-session, workspace, and time-window
proof. The additive `barkos.remote-usage-cost.v1` capability returns bounded
aggregate evidence, never raw logs or paths. Old paired hosts, direct SSH, WSL,
nested SSH/WSL, shared sessions, and ambiguous evidence remain unavailable
instead of inheriting desktop data or being guessed. Dollar totals are
pricing-table API-equivalent estimates, never provider invoices. Every scan is
started by the user's sync click and never contacts a provider.
Live Office now keeps strict client-local v1 presentation preferences for
comfortable/compact density and system/off motion. Compact mode changes only
spacing, not evidence visibility. System reduced-motion always wins; explicit
off disables descendant and menu animation. Tabs and view options are keyboard
operable, worker/work collections use semantic lists, and the changing summary
is a polite live region. Local, direct-SSH, and WSL Claude/Codex/Droid/Gemini workers now
block classified shell and external tool mutations before execution, bind
approval to the exact Dispatch, transport, launch token, provider, tool name,
and canonical input hash, and consume it once. Remote relays use a versioned
bidirectional request over the existing JSON-RPC channel; zero or multiple
owning-client claims deny. A managed-hook install result gates the physical
SSH/WSL spawn, so an old or missing script cannot silently bypass enforcement.
Paired-runtime Claude/Codex launches now require the v1 capability-negotiated E2EE
subscription before host creation. The host binds approval ownership to the
authenticated device, rechecks the live PTY incarnation, launch token, agent,
workspace, and active Dispatch, and sends classified requests only to that
owner. Channel loss and stale identity deny; read-only tools remain local and
neutral. Nested SSH/WSL agents inside a paired runtime preserve the same owner
and add their exact connection identity to the proof. Droid uses an additive v2
capability and separate RPC endpoints, while Gemini uses additive v3 endpoints
for its distinct `BeforeTool` and `{ decision, reason }` contract. Old v1/v2
hosts remain compatible and fail closed for unsupported providers. v2/v3 hosts
must also prove the exact managed Droid/Gemini hook before creating the PTY;
globally or individually disabled hooks never count as ready. The broader M5
exit criterion remains open for the remaining providers.

## Multi-agent office hardening

- [x] Reuse the durable orchestration mailbox instead of creating a competing
      filesystem message authority.
- [x] Add strict conversation/reply lineage, Task/Dispatch identity, reply
      semantics, and a bounded forwarding limit for agent collaboration.
- [x] Give every persistent worker the same mailbox/handoff/completion contract
      in its launch briefing.
- [x] Add a safe autonomous-provider capability matrix for Codex, Claude,
      OpenCode, Gemini, and Droid staffing proposals.
- [x] Drive office stations from real file, browser, planning, implementation,
      test, review, blocked, and waiting events.
- [x] Advance dependent tasks through a bounded four-transition automation
      cycle instead of waiting for one poll per state change.
- [x] Rank same-scope approved memory by offline task relevance before applying
      the existing bounded context budget.
- [x] Add a read-only conversation timeline and envelope animation backed only
      by persisted mailbox events.
- [ ] Add semantic memory retrieval as an optional index over the existing
      markdown-first, promotion-gated memory vault.
- [ ] Add external task intake adapters only after their credential broker,
      origin identity, and reply-routing boundaries are defined.

## Cross-platform packaging

- [x] Keep BarkOS package, executable, application ID, protocol, and artifact
      names separate from the upstream desktop application.
- [x] Produce and smoke-test an unsigned Apple Silicon macOS DMG locally.
- [x] Add a BarkOS-owned GitHub Actions matrix for macOS DMG/ZIP, Windows NSIS,
      and Linux AppImage/deb artifacts.
- [ ] Add Apple notarization and Windows code-signing only after BarkOS signing
      identities are supplied; unsigned artifacts remain test builds.

## Explicit non-goals for the first release

- Reimplementing Orca's terminal, worktree, git, SSH, or mobile engines.
- Copying third-party visual assets, code, prompts, or branding.
- Cloud-storing provider credentials.
- Unbounded autonomous purchasing, deployment, messaging, or deletion.
- Pretending technical validation limits are safe recommended agent counts.
