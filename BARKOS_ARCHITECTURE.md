# BarkOS architecture

## Product boundary

BarkOS is a local-first AI company operating system. Orca remains the execution
kernel for terminals, worktrees, agent sessions, source control, review, SSH,
and remote runtimes. BarkOS adds a product layer for companies, named workers,
roles, memory, delegation policy, evidence, approvals, and provider capacity.

The boundary is deliberate:

- `src/main/runtime` remains the execution authority.
- `src/shared/barkos` owns portable BarkOS domain contracts.
- BarkOS state stores identifiers and policy, never provider credentials.
- Renderer views consume BarkOS contracts through versioned IPC/RPC methods.
- Paired-runtime fields are additive and optional; behavior that cannot degrade
  safely is capability-negotiated.
- Folder workspaces remain valid; worktrees are a policy choice, not an
  assumption.

## Domain model

```text
Company
├── Roles
│   ├── mission
│   ├── capabilities
│   └── definition of done
└── Workers
    ├── role
    ├── preferred agent/provider
    ├── preferred execution environment
    └── workspace policy

Objective
└── Plan
    └── Task → Assignment → Dispatch
                            ├── Decision request → User resolution
                            └── Evidence → Review decision
                                           └── Memory candidate → User promotion → Memory entry
```

Company, role, and worker identity must survive terminal and provider-session
replacement. A dispatch is temporary execution; a worker is a persistent
product identity.

## Delegation boundary

BarkOS does not create a second execution scheduler. Its delegation ledger adds
product identity, plan versions, worker selection, approval state, and review
evidence around Orca's existing orchestration runtime:

| BarkOS record | Orca execution record                  | Ownership                                                            |
| ------------- | -------------------------------------- | -------------------------------------------------------------------- |
| `Objective`   | orchestration `Run`                    | BarkOS owns the durable brief; Orca owns live run state.             |
| `Task`        | orchestration `Task`                   | BarkOS owns dependencies and policy; Orca owns execution lifecycle.  |
| `Assignment`  | none                                   | BarkOS records the named worker choice and its rationale.            |
| `Dispatch`    | orchestration `Dispatch`               | BarkOS stores bounded attempt/audit links; Orca performs the launch. |
| `Evidence`    | runtime, git, test, and review outputs | BarkOS stores the bounded review manifest, never credentials.        |

The shared work-ledger contract is strict and versioned. It rejects dangling
references, dependency cycles, runnable tasks with unfinished prerequisites,
duplicate active assignments, duplicate dispatch attempts, inconsistent
terminal states, unapproved protected dispatches, and completion without
accepted evidence. The adapter translates these records into the existing
version-negotiated Orca RPC methods without adding incompatible fields to the
remote wire. Objective and Task bindings are persisted immediately after Orca
returns their identifiers, so plan materialization can resume without creating
known duplicates.

Dispatch is deliberately two-phase. BarkOS first persists a `prepared` attempt,
then invokes Orca with the exact coordinator and worker terminal handles, and
finally records the returned Run, Task, and Dispatch identifiers. An unsettled
attempt blocks automatic retry; a timeout is treated as a possible side effect
that requires reconciliation. Each ledger mutation increments an optimistic
revision, so two renderer actions based on stale state cannot silently overwrite
one another. Existing sessions can be dispatched only when they resolve to the
same Orca runtime owner; cross-runtime work will use Orca's explicit federation
path in a later adapter slice.

Stopping a running Dispatch uses a separate fail-closed settlement sequence.
After explicit destructive confirmation, BarkOS first persists a stop request
bound to the exact Orca Dispatch identifier and recognized worker terminal
handle. It then requires an exact `orchestration.workerStop` receipt, persists
that authority proof, and requires `terminal.close` to echo the same handle with
`ptyKilled: true`. Only after both proofs does it mark the Dispatch and Task
`cancelled` and remove the Assignment from active load. A timeout, mismatched
receipt, unproven PTY kill, interrupted persistence, or restart leaves the last
durable `requested`, `dispatch-stopped`, or `uncertain` boundary visible and
blocks another stop attempt. No ambiguous state is presented as stopped.

Reassignment is a new-work transition, not part of stop settlement. It is
available only when the source Dispatch is durably `cancelled` with a completed
exact Dispatch/PTY settlement and its Task remains cancelled. The stopped
worker is excluded from deterministic selection. BarkOS atomically marks the
source Assignment `reassigned`, creates a different approved Assignment, moves
the Task back to `ready`, and creates a fresh dispatch gate when policy requires
one. That ledger revision is durable before worker-session or Dispatch effects.
Paused execution, missing different-worker capacity, ambiguous stop authority,
or repeated use of the same stopped Assignment fails before launch.

Worker selection is deterministic. A worker must be active, cover every
required capability, and remain below the configured active-assignment limit.
Lower load wins before preferred-environment affinity, then availability and a
stable worker identifier break ties. A failed match returns a structured reason
instead of silently assigning partial capability coverage.

The objective board exposes this boundary through an explicit execution action.
For an unbound Task, “Assign and start” first prepares the Orca Run and Task
records, records the selected worker and rationale, then injects the exact Task
specification into that worker's recognized live agent terminal. Low and medium
risk work can complete those steps in the same user action. High and critical
risk work always creates a persisted authority gate; approving it injects the
dispatch. The assigned worker and coordinator must both have exact live terminal
handles on the same Orca runtime. Adapter failures trigger an authoritative
ledger reload because a timed-out runtime call may already have produced a side
effect. A persisted assignment remains available for an explicit retry if its
worker session was not ready.

The Objective Planner writes an explicitly user-approved plan without touching
the execution runtime. It derives bounded stable identifiers, validates the
dependency graph, keeps tasks with prerequisites blocked, and records workspace,
risk, environment, capability, and dispatch-approval policy. Materializing that
plan into Orca and dispatching workers remain separate user actions, so drafting
a plan cannot consume provider quota.

## Evidence review boundary

A worker completion report enters BarkOS as a strict, bounded evidence
manifest. Submission is permitted only for a running dispatch and must contain
at least one test result, changed file, diff summary, terminal excerpt,
screenshot, risk, or unresolved decision. Submission settles that dispatch and
moves the task to review; it does not mark work complete.

Only an explicit user review can accept or reject submitted evidence. Acceptance
completes the assignment and task, unlocks direct dependants whose prerequisites
are complete, and closes the plan and objective only when every task is done.
Rejection preserves the audit record, rejects the assignment, and returns the
task to the ready queue. Every transition is saved through optimistic ledger
revision control. The renderer displays bounded summaries rather than rendering
an entire worst-case manifest into the page at once.

## Decision inbox boundary

The decision inbox is a separate strict v2 snapshot rather than another
work-ledger field. It records the source kind, local Task/Assignment/Dispatch and
worker identities, exact Orca Run/Task/Dispatch and Message/Gate identifiers,
risk, execution host, bounded question/options, priority, and resolution audit.
It stores no terminal output, provider conversation, credential, or capability
token. The private main-process store is company-generation scoped, bounded,
owner-readable, and optimistic-revision protected; paired web mode uses the
same contract in versioned browser-local storage.

Discovery uses existing Orca RPC methods and adds no remote opcode or published
field. BarkOS first asks `orchestration.runCurrent` for the lead worker's exact
live terminal. It reads gates and the `question`, `decision_gate`, and
`escalation` message history only for that currently bound Run. It never calls
`runUse` from polling, silently takes consumer authority from another pane, or
imports a message whose payload cannot be matched to the ledger's exact
Run/Task/Dispatch chain. A processed decision-gate message is deduplicated in
favor of its authoritative Gate record. Malformed, oversized, cross-Run, and
unmatched remote rows are skipped and counted.

Resolution is two-phase. BarkOS durably records `resolving` with the proposed
user response before making one `gateResolve` or `reply` call, then records the
validated receipt as `resolved`. Any runtime or post-effect persistence failure
becomes `resolution-uncertain`; the request is not made retryable. If the app
exits while `resolving`, the next process start converts that state once to
`resolution-uncertain` without calling Orca. A user must inspect the Run and
agent before deciding what to do next. This protects old and current runtimes
whose reply paths do not share one universal idempotency key.

Desktop native-host, direct-SSH, and WSL Claude/Codex/Droid/Gemini side
effects use the same inbox through a main-owned resolution path. Their
`PreToolUse` or Gemini `BeforeTool` hooks classify
destructive shell commands, external mutations, and budgeted actions before the
provider executes them. The main process accepts a request only when the launch
carries the BarkOS enforcement marker, its provider owns the worker, its pane
resolves to the exact live Orca Dispatch, and the hook launch token hashes to
that Dispatch's stored authority. Remote requests must also match the terminal
transport: the exact SSH target and `ssh:` execution host, or the exact WSL
distro resolved for the local worktree. The durable request stores the Task,
Assignment, Dispatch, host, pane, category, redacted bounded summary, tool name,
canonical-input SHA-256, expiry, and consumption time; it never stores the raw
tool input or token.

A pending or rejected request returns `deny`, including under the providers'
full-access modes. User approval is valid for one unchanged retry and is
atomically consumed before execution; Claude, Droid, and Gemini receive their
provider-specific explicit `allow`, while Codex receives neutral `{}` because
its `PreToolUse` contract rejects `allow` without an input replacement. Replay
or changed input creates a new request.
Identity/provider/transport mismatch, absent active Dispatch context, expiry,
snapshot conflict, disk failure, or hook transport loss blocks the action.
Claude uses its blocking exit-code path on transport loss; Codex, Droid, and
Gemini receive their provider-specific structured deny from POSIX and Windows
hook scripts. Native Droid and Gemini launches also recheck that the managed
hook is installed and enabled at both renderer preflight and the trusted PTY
boundary. Direct SSH and WSL launches require the relay/guest bundle to report
the exact provider hook before the physical PTY can spawn. Paired-runtime
Droid uses the additive `barkos.paired-side-effect-approval.v2` capability and
separate v2 RPC endpoints; v1 semantics remain Claude/Codex-only. A v2 host
rechecks the exact managed Droid hook before PTY creation and uses the existing
authenticated owner/Dispatch proof for each request. Gemini uses the separate
additive `barkos.paired-side-effect-approval.v3` capability and v3 RPC endpoints;
v1/v2 parsers never accept Gemini frames. A v3 host rechecks the exact enabled
Gemini managed hook before PTY creation, and pending decisions reject the
Claude/Codex response schema in favor of Gemini's `{ decision, reason }` schema.
For supported SSH and WSL agents, the loopback relay sends the versioned
`agent_hook.evaluateBarkosSideEffect.v1` request over the existing bidirectional
JSON-RPC channel. Exactly one active Orca client must claim the Dispatch; zero,
multiple, malformed, timed-out, or method-not-found responses deny. This adds no
stream opcode. The additive managed-hook install result records exact installed
agents, and the SSH/WSL PTY host refuses the physical BarkOS worker spawn until
the matching current hook is present. Normal non-BarkOS sessions keep their
existing hook behavior. Unsupported provider/host combinations remain
fail-closed until they expose an equivalent client-owned decision channel and
pre-execution identity boundary.

The renderer refreshes once when the Company page, ledger, decision snapshot,
and exact lead terminal are ready. It polls every two seconds only while that
page remains mounted and the ledger has an active dispatch; the calls are
read-only except for an explicit user approval or rejection. The poll also
loads main-created local side-effect requests when no lead terminal is ready.
No timer, daemon, watcher, provider call, or quota consumer remains when the
page or application is closed.

## Memory boundary

The memory vault is a separate strict v1, company-generation-scoped snapshot.
Its contracts support company, role, worker, project, and task scopes. Every
candidate and promoted entry carries its accepted-evidence source, Task,
Assignment, Dispatch, worker, role, workspace, capture time, confidence,
optional expiry, and contradiction lineage. The private desktop store is
owner-readable, bounded to 4 MiB, durable, and optimistic-revision protected;
paired web mode uses the same contract in versioned browser-local storage.

Evidence acceptance never writes active long-term memory. It deterministically
creates one project-scoped promotion candidate for the exact accepted evidence.
Credential-like diff, risk, or title text is omitted while the source identity
and omission note remain auditable. The user must explicitly promote or reject
the candidate in the Memory workspace. Promotion creates the active entry;
rejection preserves the candidate audit; revocation disables an active entry
without deleting provenance. Contradictions may supersede only an active entry
in the same scope, and both sides of that lineage must agree in the snapshot.

The worker-launch retrieval boundary selects active, unexpired
company/role/worker/project memory matching that worker and exact workspace,
orders more-specific scopes first, rejects credential-like content again, and
packs only whole records into a measured 4,000-character budget. The resulting
briefing labels memory as reference context and states that the current task and
explicit authority take precedence.

The task retrieval boundary runs at the exact user-triggered Orca Dispatch. It
requires the current Company generation and exact Task, Assignment, Dispatch,
worker, role, and workspace chain, then packs relevant records into a separate
8,000-character limit. Before the RPC side effect, work-ledger v4 persists a
deterministic receipt identifier, selected memory identifiers, SHA-256 context
hash, character count, and `prepared` state. The existing dispatch RPC accepts
the context and receipt identifier as paired optional fields and echoes the
hash/count when supported. A current host marks it `delivered`; an older host
may ignore the additive fields, in which case the task may run but BarkOS marks
delivery `unconfirmed`. A possible-effect failure is also never presented or
retried as confirmed delivery. No new stream opcode or protocol-version bump
was added, and no background memory worker, provider call, or automatic action
runs.

The proposal editor permits scope targets only from accepted-evidence
provenance. It validates confidence, future expiry, and explicit same-scope
contradictions before promotion, preventing arbitrary cross-project targeting.

Backup bundle v1 stores the strict current Company and independently versioned
memory vault under one company-generation check. Export and import reject
credential-like content and are bounded to 5 MiB; importing an old company-only
JSON creates an empty vault for compatibility. Selecting a file never mutates
the current company—the replacement happens only after explicit confirmation.

## Execution control boundary

Execution control is a separate strict v1 policy scoped to the exact Company
identifier and creation timestamp. Desktop mode stores it in a durable,
owner-only, 64 KiB-bounded file behind trusted renderer IPC; paired web mode
uses the same contract in versioned browser-local storage. Each update advances
an optimistic revision. The policy is intentionally client/host-local and is
not included in BarkOS backup export: concurrency represents the machine that
will perform the work, and importing a Company must not silently import another
machine's execution authority.

The default policy is running with four concurrent Dispatches, two active
Assignments per worker, and 100 Dispatch attempts per Objective. The Objective
limit is an execution-unit budget, not a monetary or token-cost claim. Active
Dispatch concurrency counts `prepared`, `requested`, and `running` records;
active worker load counts `proposed`, `approved`, and `dispatched`
Assignments. Every limit is bounded by the shared schema.

Pause is a fail-closed gate for new work started from that client. Task
assignment and approval actions load the current durable policy before changing
the work ledger. The Dispatch adapter loads it again immediately before the
two-phase prepare/RPC boundary and rejects paused execution, exhausted
concurrency, exhausted Objective budget, or scope mismatch before persistence
or runtime mutation. Manual Codex recovery checks the same durable pause state
before worker-session, account, Dispatch, or terminal mutation. Optimistic
work-ledger persistence remains the serialization barrier for concurrent
Dispatch attempts.

Pause does not itself stop an existing agent, terminate a terminal, or cancel a
running Dispatch. Those effects require the separate explicit stop action and
its exact Dispatch/PTY receipts. Stop remains available while execution is
paused because it reduces active authority; it never relaunches a missing
worker terminal to manufacture kill evidence. Direct worker launch also
remains a separate explicit action rather than being represented as a Task
Dispatch.

Live Office is a read-only projection. It joins active durable Assignments,
their latest Dispatch and Task states, exact worker-session bindings, and the
existing in-memory agent hook snapshot for the same tab, workspace, agent, and
execution host. It performs no provider refresh, terminal read, polling loop,
or worker launch. A running ledger record without an exact live hook is labeled
`runtime-unconfirmed`; an ambiguous stop remains higher priority than a stale
working hook. Historical reassigned Assignments never count as current worker
load.

Live Office presentation preferences are a strict client-local v1 record, not
Company state or runtime authority. Comfortable/compact density and system/off
motion persist in versioned browser storage and do not enter Company backup.
Compact density changes spacing only and never hides work, status, tool, or
attention evidence. System reduced-motion remains authoritative; explicit off
also suppresses Office descendant and options-menu animation.

The Office is exposed as a labelled region with a level-two heading, polite
atomic summary, semantic worker and active-work lists, labelled statuses, and
screen-reader tool context. The existing Radix tablist and view-options menu
provide roving-focus, arrow-key, Enter/Space, and checked-state semantics. These
presentation choices do not poll providers, start workers, or add timers.

## Usage and cost boundary

Usage and cost accounting is a separate strict v1 ledger scoped to the exact
Company generation. It never changes or consumes the execution-unit limits.
The desktop store is private, durable, bounded to 4 MiB, and excluded from
Company backup because the evidence is host-scoped. Paired web mode cannot read
desktop provider logs and fails closed instead of relabeling local data as
remote accounting.

Collection is an explicit user action. Local Dispatches scan Orca's existing
desktop Claude/Codex usage stores without contacting a provider, launching a
worker, or starting a background poll. A local record is attributable only for
a terminal Dispatch with an exact provider-session binding, matching workspace,
and a provider session wholly inside the Dispatch time window. A provider
session used by more than one Dispatch is marked unavailable.

Native Claude/Codex work on a paired runtime uses the additive
`barkos.remote-usage-cost.v1` capability and `barkos.usageCost.collect` RPC. The
desktop pins the advertised runtime identity, sends only exact orchestration
Dispatch ids, and accepts only matching runtime, Dispatch, workspace, and
worker-provider evidence. The host derives the provider session itself and
requires the authenticated paired device to own the still-live local PTY. It
also proves the finished host Dispatch, terminal handle, process incarnation,
launch-token hash, local host scope, provider, workspace, exclusive session,
and time window. Only bounded token/model/API-equivalent estimate aggregates
cross the wire; provider files, transcripts, paths, credentials, and renderer
session claims do not. Host scan errors are returned only as reason codes.

Capability absence, host restart, owner or identity mismatch, missing results,
direct SSH/WSL, and nested SSH/WSL all fail closed as unavailable. The desktop
never scans its own provider logs on behalf of remote work. The strict v1 RPC
is additive and uses no new stream opcode, so independently updated clients and
hosts remain wire-compatible.

Token buckets are provider-derived from the exact transcript or rollout on the
host that executed the work.
Dollar values use Orca's pricing tables and are labeled API-equivalent
estimates, not invoices or billing truth. The ledger keeps token attribution
and price availability separate so a missing model price cannot silently turn
a partial estimate into a complete total. Opening BarkOS reads only the small
durable ledger; provider-log scanning occurs only on manual sync.

## Provider capacity boundary

Provider capacity is a separate strict v1, company-generation-scoped ledger.
An observation stores only provider, opaque account identifier or system
default, execution host, host/WSL lane, normalized status and reason, bounded
usage percentage, reset/retry timestamps, and source/observation times. It does
not store tokens, cookies, account email addresses, credential provenance, or
provider conversation content. The desktop snapshot is private, durable,
bounded to 2 MiB, and optimistic-revision protected; paired web mode uses the
same contract in versioned browser-local storage. Capacity is intentionally not
part of BarkOS backup export because it is host-local and quickly becomes stale.

Snapshot sync is an explicit user action in the Capacity workspace. It reads
Orca's existing account roster and current usage snapshot; it does not invoke a
provider refresh or mutate the selected account. A source is eligible only when
its usage is fresh and explicitly available. Missing, refreshing, partial,
older-than-fifteen-minute, or otherwise uncertain usage fails closed as
`unknown`. A local one-shot roster may use the current local Orca usage state,
but a paired runtime without usage data never inherits the desktop's local
usage. SSH, paired-runtime, host, and WSL observations remain distinct and may
not cross scopes.

The desktop UI can also expose a targeted read-only recovery check without a
prior generic sync. The candidate must be the exact running BarkOS Dispatch,
Assignment, Task, Codex worker binding, workspace, and local host; the resolved
agent turn must be `done`, must not be a session boundary, and must carry the
matching Orca Task and Dispatch identifiers with `dispatchStatus: dispatched`.
It must also carry `providerFailure.kind: usage-limit-exceeded`, derived only
from the exact Codex rollout `task_complete.turn_id` and its structured
`error.codex_error_info`; terminal, assistant, and error prose are never
classified. Clicking the check reads the current Orca roster and
already-observed usage state without refreshing a provider. Unknown or absent
inactive-account usage fails closed.

Codex does not run its `Stop` hook on terminal provider errors. The local hook
server and SSH relay therefore keep a bounded incremental JSONL cursor while an
exact Codex turn is active. They read only appended rollout bytes, accept both
`task_complete` and the forward-compatible `turn_complete` alias, require the
hook's exact `turn_id`, and stop polling at completion. The optional normalized
`providerFailure` field is backward-compatible: older peers omit or ignore it,
while new recovery logic fails closed when it is absent. No error message text,
credential, or conversation content enters the failure contract.

The shared failover policy may select only an `available` account matching the
exact provider, execution host, and runtime lane. It prefers the active account,
then lower usage, then a stable opaque key; it never selects the same account
twice and stops after at most three attempts. If every remaining scoped account
has a known future reset/retry time, it stops with the earliest wake time.
Missing or mixed uncertain data stops as no eligible account instead of
guessing.

Failover audit records are also strict and bounded. A selected attempt must
settle with the matching outcome/reason pair. Success terminates as completed;
an ambiguous possible side effect terminates as uncertain and cannot advance to
another account. The current execution adapter implements one deliberately
narrow capability: explicit local-host Codex recovery in the desktop app. It
revalidates the running BarkOS Task, Assignment, Dispatch, Codex worker binding,
exact Orca terminal/Dispatch authority, structured usage-limit failure, current
provider limit, selected host, and host runtime lane immediately before
mutation. Existing failed audits may advance only to an untried account; an
interrupted selected attempt becomes uncertain exactly once when the ledger
loads.

Selection is durably stored before account mutation. The trusted main process
selects only the requested managed Codex account on the host lane, then performs
a separate authoritative roster read through `codexAccounts.list`. The mutation
response alone never proves selection and cannot authorize Dispatch or PTY
changes. A missing or inconsistent read-back freezes the audit as uncertain. For
same-conversation recovery, BarkOS accepts only a rollout whose path resolves
under a trusted Codex home, then hard-links that exact regular file into the
target managed account home and rewrites only the trusted transcript path. An
existing divergent target is rejected; the system-default target and unverified
provenance use a visibly recorded new session instead. BarkOS never writes the
user's real system-default Codex home.

After confirmed mutation, BarkOS stops the exact old Orca Dispatch and requires
`terminal.close` to prove `ptyKilled: true` before a replacement agent can be
launched. It then rebinds coordinator authority when the worker is the lead,
resets the same Orca Task, injects a new Dispatch, and persists its identifier in
the existing BarkOS Dispatch. Any failure after a possible effect freezes the
audit as uncertain; it does not launch another writer or retry another account.
The Capacity UI offers this only as a user-clicked desktop action and shows the
durable result history. Paired web clients do not expose the mutation action.
The recovery click repeats the current roster/usage read and every execution
eligibility check before mutation, so a stale prior check cannot authorize an
account change. Typed live limit detection is available only for an exact Codex
turn; there is still no background provider refresh or automatic account
switching.

Evidence collection is also an explicit user action. For a running dispatch,
BarkOS resolves the named worker's exact terminal pane and reads only a bounded
tail from Orca's existing local, SSH, or paired-runtime terminal transport. It
does not inject terminal input. At the same time, BarkOS requests a fresh,
read-only Git status from the exact bound workspace and execution host. Local,
SSH, and paired-runtime routes use Orca's existing runtime-aware Git boundary;
a stale host binding is rejected. The request is cancelled when the dialog is
closed, and a failure falls back to the current cache with an explicit cached
label. Changed files are deduplicated and capped. Test results may still be
recorded manually. Automatic capture starts only when the user clicks `Run test`;
opening or submitting the dialog never executes a command. The trusted main
process revalidates the exact running Dispatch, dispatched Assignment, worker
session, workspace, and execution host, then parses one validation-shaped command
into fixed binary and argv without a shell. Shell composition, non-validation
commands, install/publish actions, and write/update flags are rejected. Local and
WSL commands use Orca's runtime-aware command runner; direct SSH uses the exact
target and an isolated operation lane. Execution is limited to five minutes and
64 KiB, interactive Git credential prompts are disabled, output is stripped and
redacted in the main process, and only a bounded result reaches the renderer.
Closing the dialog or destroying its renderer aborts the matching run. Paired
runtime execution additionally requires the host-advertised
`barkos.test-evidence-execution.v1` capability. The desktop pins the saved
pairing revision, then verifies the capability and runtime identity with a
status preflight on the same dedicated E2EE socket that carries the command.
If preflight fails the command frame is never sent; a host restart closes that
socket before execution, and the final response must retain the preflight
runtime identity. The request sends only the versioned command plus workspace,
tab, and Orca Run/Task/Dispatch identifiers.
The host re-parses the command and independently verifies the authenticated
owner device, current PTY incarnation and launch token, exact active Dispatch,
tab, workspace, and host-local workspace root before spawning. It applies the
same timeout, output bound, prompt guards, stripping, and redaction before the
result crosses the wire. The long-running request uses a dedicated E2EE socket
so dialog close, renderer destruction, transport timeout, or disconnect aborts
the host child process instead of merely retiring a client response. A host
without the capability, a restarted/re-paired host, stale authority, or a
nested SSH/WSL workspace remains fail-closed with manual evidence available;
paired web execution still cannot start a desktop command. Validation-shaped
project scripts execute with the user's normal OS permissions; this boundary is
not represented as a sandbox. Screenshot evidence is also opt-in per attachment:
BarkOS opens a native chooser for an existing PNG, JPEG, GIF, or WebP image and
does not request screen-recording permission. The trusted main process rejects
empty, oversized, or unsafe-dimension images, hashes their bytes with SHA-256,
and stores deduplicated content-addressed copies under private BarkOS user data.
The renderer receives only bounded asset metadata and never raw image bytes.
ANSI/control sequences and oversized terminal, path, and text fields are
stripped or truncated before persistence.

## Worker session binding

Launching a worker is an explicit user action. BarkOS resolves only eligible
local, folder, git worktree, SSH, and paired-runtime targets where the selected
agent is detected, then delegates activation and terminal creation to Orca's
existing host-aware launch path. The first submitted message is a bounded
identity and role briefing. When the memory vault is ready, it may also contain
only the relevant approved memory selected by the memory boundary; it contains
no intentionally retained provider credentials.

Before launch, BarkOS derives and displays the effective provider permission
mode from the exact agent arguments and environment. Full-access modes may read
and write files, run commands, use the network, and start processes with the
user's operating-system account on the selected host. Role instructions and
approval requests are operating policy, not an OS sandbox; isolated workspaces
or hosts remain the containment boundary for untrusted work.

For paired-runtime Claude/Codex workers, launch is conditional on the host
advertising `barkos.paired-side-effect-approval.v1`; Droid requires
`barkos.paired-side-effect-approval.v2`. Both require an owner-only E2EE
subscription reaching `ready`. The host derives the owner from the authenticated
paired device, never request data. Before forwarding a classified `PreToolUse`,
it verifies the current PTY incarnation, launch token commitment, agent, pane,
workspace, and active Orca Run/Task/Dispatch. The desktop independently joins
that proof to its durable BarkOS Company/work ledger, then applies the same
one-shot canonical-input approval used locally and over SSH/WSL. Missing,
malformed, timed-out, disconnected, stale-generation, or wrong-owner evidence
denies. Read-only tools are decided on the host without transmitting their
input. The subscription is created only after an explicit paired BarkOS worker
launch and does not exist while the application is closed.

For Droid, native desktop, direct SSH, and WSL hosts are supported. The hook
forwards Factory's exact `PreToolUse` payload and BarkOS enforcement marker,
returns the main-owned decision in Factory's structured response shape, and
emits a structured deny if the approval service disappears. Native launch
rechecks the local Factory hook. Direct SSH and WSL launch only after the
version-matched relay/guest has installed and reported the exact Droid hook;
the main process then verifies the SSH target or WSL distro against the active
Dispatch before deciding. Paired Droid starts only after v2 negotiation and an
exact host-side managed-hook readiness check. A legacy or v1-only host is never
silently upgraded and remains fail-closed for Droid.

A nested SSH/WSL agent launched inside a paired runtime uses the same paired
owner channel before any host-local SSH evaluator. Its exact remote connection
identity is part of the live PTY/Dispatch proof; missing paired ownership or
channel state therefore denies instead of silently changing approval owners.

The current worker-to-session binding is a separate strict, versioned BarkOS
snapshot. It persists only the worker and agent identity, the exact target,
workspace kind and identifier, execution host, terminal tab identifier or
unconfirmed-request state, and launch time. It never stores credentials,
prompts, provider conversation material, or terminal output. The private main
process store bounds the file size, writes it with owner-only permissions, and
ties it to both the company identifier and creation timestamp so a later company
cannot inherit an archived company's sessions by reusing an identifier.

On load, BarkOS reconciles bindings against the current roster and removes
workers whose identity or agent changed. A recognized live agent terminal on
the same tab, workspace, and local, SSH, or paired-runtime host is `ready`; an
existing launch tab without a published terminal is `starting`; a missing tab
is `relaunch-required`; and a remote request without a confirmed tab remains
`requested`. Dispatch accepts only `ready`. For a recoverable binding, BarkOS
rechecks current eligibility and relaunches only the exact persisted target,
then waits up to a bounded timeout for the recognized terminal. It never chooses
a different workspace or host automatically. An unconfirmed remote request is
not retried automatically because the original host may already have created
the agent. Likewise, a snapshot write failure after confirmed host creation is
reported as a persistence error without reclassifying the launch as failed, so
the UI cannot invite a duplicate agent launch.

## Snapshot evolution

Company and work-ledger snapshots move through explicit, consecutive
migrations; a migration may advance exactly one schema version and the final
value must pass the current strict contract. Work-ledger v2 adds durable Orca
bindings and optimistic revisions. Work-ledger v3 persists mandatory dispatch
approval for pending high/critical-risk work. Work-ledger v4 adds nullable
memory-delivery receipts. Work-ledger v5 adds nullable Dispatch stop settlement
records through the tested v0→v1→v2→v3→v4→v5 chain; migration creates only an
empty slot and never claims that historical work was stopped.
Worker-session snapshot v1 is stored independently so session lifecycle
metadata cannot mutate the durable company definition. Decision-inbox snapshot
v1 is also independent, allowing message audit/recovery to evolve without
changing delegation state. Memory-vault snapshot v1 independently carries
promotion audit and retrieval metadata so memory evolution cannot rewrite the
work ledger. Provider-capacity snapshot v1 independently carries host-local
usage observations and future failover audits without entering company backup
export. Control-policy snapshot v1 independently carries client-local pause and
execution limits and likewise does not enter company backup export. Usage-cost
snapshot v1 independently carries exact local attribution and API-equivalent
estimates and is also excluded from company backup. A newer unknown version is
never downgraded. Before
the local store replaces a legacy company or ledger snapshot, it writes a
bounded, private pre-migration backup so a failed or incorrect upgrade remains
recoverable.

## Data placement

Local by default:

- company and worker definitions;
- prompts, code, terminal output, reports, and evidence;
- provider credentials and account session material;
- normalized, host-local provider capacity observations and failover audits;
- client/host-local execution pause state and limits;
- host-local provider token attribution and API-equivalent cost estimates;
- private worker and project memory.

Eligible for opt-in sync:

- non-secret company roster metadata;
- task-board state and approval decisions;
- explicitly promoted memory rules;
- device identities and revocable access grants.

## Required invariants

1. Every worker references an existing role.
2. The lead worker exists in the same company.
3. Provider credentials never enter company snapshots or task payloads.
4. Every completed assignment carries an accepted evidence manifest.
5. Account failover is bounded, auditable, and never loops.
6. A remote client cannot gain capabilities absent from its negotiated grant.
7. BarkOS can ingest upstream Orca changes without rewriting the execution
   kernel.
8. A task has at most one active assignment and at most three recorded dispatch
   attempts per assignment.
9. Dependency-blocked work cannot become runnable, and protected dispatches
   require an explicit user approval record.
10. New high- and critical-risk Tasks cannot dispatch without a persisted user
    approval gate.
11. A decision response is emitted at most once by BarkOS; interrupted or
    ambiguous mutation outcomes remain visibly uncertain and are never retried
    automatically.
12. Accepted evidence can create a memory candidate, but only a user promotion
    can create active memory; revoked, expired, superseded, unrelated, or
    credential-like records cannot enter a worker briefing.
13. Task memory is claimed as delivered only when the host echoes the exact
    receipt identifier, SHA-256 context hash, and character count; absent or
    ambiguous acknowledgement remains visibly unconfirmed.
14. Provider capacity from one execution host or host/WSL lane is never used to
    select an account in another scope.
15. A failover never retries the same account, exceeds three attempts, or
    advances after an ambiguous possible side effect; selection is durable
    before account mutation and replacement launch requires proof that the old
    PTY was killed.
16. A recovery control requires the exact settled, non-boundary Codex turn, its
    structured `usage-limit-exceeded` cause, and still-dispatched Orca authority;
    account mutation requires a fresh fail-closed roster/usage read and cannot
    rely on a stale UI observation.
17. A paused client cannot create a Task Assignment, approve protected new
    work, start a Dispatch, or mutate a Codex account for recovery; pausing does
    not falsely claim that existing processes were terminated.
18. New Dispatches cannot exceed the current client policy's active concurrency
    or per-Objective execution-unit budget, and new Assignments cannot exceed
    the selected worker's active-assignment limit.
19. A running Dispatch is marked cancelled only after the exact Orca Dispatch
    stop receipt and exact worker-terminal `ptyKilled: true` receipt; any
    possible but unproven effect remains durable and cannot be retried.
20. A stopped Task can be reassigned only from a completed stop settlement; the
    stopped worker is excluded, the old Assignment remains auditable, and the
    replacement Assignment is durable before any launch effect.
21. Live Office never turns missing hook evidence into a claim that an agent is
    working and never refreshes provider capacity merely because the view is
    open.

## Upstream strategy

Keep upstream Orca commits mergeable. Prefer new BarkOS modules and narrow
adapters over global renames. Internal `orca` identifiers may remain where they
are protocol, storage, environment-variable, or compatibility contracts. User
visible branding migrates separately from those contracts.
