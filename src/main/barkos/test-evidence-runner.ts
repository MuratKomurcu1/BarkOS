import type { Store } from '../persistence'
import { getSshGitProvider } from '../providers/ssh-git-dispatch'
import { gitCredentialPromptGuardEnv } from '../../shared/git-credential-prompt-env'
import {
  getRepoExecutionHostId,
  normalizeExecutionHostId,
  parseExecutionHostId,
  toSshExecutionHostId,
  type ParsedExecutionHost
} from '../../shared/execution-host'
import { isAbsoluteRuntimePath } from '../../shared/ephemeral-vm-recipes'
import { parseWorkspaceKey } from '../../shared/workspace-scope'
import { splitWorktreeIdForFilesystem } from '../../shared/worktree/id'
import type { BarkosCompanyStore } from './company-store'
import type { BarkosWorkLedgerStore } from './work-ledger-store'
import type { BarkosWorkerSessionStore } from './worker-session-store'
import {
  buildBarkosTestEvidenceResult,
  runBarkosLocalTestEvidenceCommand,
  type BarkosTestEvidenceCommandResult
} from './test-evidence-command-executor'
import {
  BARKOS_TEST_EVIDENCE_TIMEOUT_MS,
  planBarkosTestEvidenceCommand,
  type BarkosRuntimeTestEvidenceRunRequest,
  type BarkosTestEvidenceRunRequest,
  type BarkosTestEvidenceRunResult
} from '../../shared/barkos/test-evidence-run'

type TestEvidenceRunnerDeps = {
  companyStore: Pick<BarkosCompanyStore, 'load'>
  ledgerStore: Pick<BarkosWorkLedgerStore, 'load'>
  workerSessionStore: Pick<BarkosWorkerSessionStore, 'load'>
  workspaceStore: Pick<Store, 'getFolderWorkspace' | 'getRepos'>
  runLocal?: (
    binary: string,
    args: string[],
    cwd: string,
    signal: AbortSignal
  ) => Promise<BarkosTestEvidenceCommandResult>
  runSsh?: (
    targetId: string,
    binary: string,
    args: string[],
    cwd: string,
    signal: AbortSignal
  ) => Promise<BarkosTestEvidenceCommandResult>
  runRuntime?: (
    environmentId: string,
    request: BarkosRuntimeTestEvidenceRunRequest,
    signal: AbortSignal
  ) => Promise<BarkosTestEvidenceRunResult>
}

type ExecutionAuthority =
  | {
      kind: 'direct'
      cwd: string
      host: Exclude<ParsedExecutionHost, { kind: 'runtime' }>
    }
  | {
      kind: 'runtime'
      environmentId: string
      request: BarkosRuntimeTestEvidenceRunRequest
    }

function folderExecutionHostId(folder: {
  connectionId?: string | null
  executionHostId?: string | null
}): string {
  return (
    normalizeExecutionHostId(folder.executionHostId) ??
    (folder.connectionId ? toSshExecutionHostId(folder.connectionId) : 'local')
  )
}

function resolveExecutionAuthority(
  deps: TestEvidenceRunnerDeps,
  request: BarkosTestEvidenceRunRequest
): ExecutionAuthority {
  const company = deps.companyStore.load()
  if (!company) {
    throw new Error('barkos_company_not_found')
  }
  const ledger = deps.ledgerStore.load(company)
  const sessions = deps.workerSessionStore.load(company)
  const dispatch = ledger?.dispatches.find((entry) => entry.id === request.dispatchId)
  const assignment = dispatch
    ? ledger?.assignments.find((entry) => entry.id === dispatch.assignmentId)
    : null
  const binding = dispatch
    ? sessions?.bindings.find((entry) => entry.workerId === dispatch.workerId)
    : null
  if (
    !ledger ||
    !dispatch ||
    dispatch.state !== 'running' ||
    !assignment ||
    assignment.status !== 'dispatched' ||
    assignment.taskId !== dispatch.taskId ||
    assignment.workerId !== dispatch.workerId ||
    !binding ||
    binding.state !== 'created' ||
    binding.workspaceId !== dispatch.workspaceId ||
    binding.executionHostId !== dispatch.executionHostId
  ) {
    throw new Error('barkos_test_dispatch_authority_mismatch')
  }

  const host = parseExecutionHostId(binding.executionHostId)
  if (!host) {
    throw new Error('barkos_test_execution_host_invalid')
  }
  if (host.kind === 'runtime') {
    if (
      !binding.tabId ||
      !dispatch.orchestrationRunId ||
      !dispatch.orchestrationTaskId ||
      !dispatch.orchestrationDispatchId
    ) {
      throw new Error('barkos_test_paired_runtime_authority_missing')
    }
    return {
      kind: 'runtime',
      environmentId: host.environmentId,
      request: {
        version: request.version,
        workspaceId: binding.workspaceId,
        tabId: binding.tabId,
        orchestrationRunId: dispatch.orchestrationRunId,
        orchestrationTaskId: dispatch.orchestrationTaskId,
        orchestrationDispatchId: dispatch.orchestrationDispatchId,
        command: request.command
      }
    }
  }

  let cwd: string | null = null
  if (binding.workspaceKind === 'folder') {
    const scope = parseWorkspaceKey(binding.workspaceId)
    const folder =
      scope?.type === 'folder'
        ? deps.workspaceStore.getFolderWorkspace(scope.folderWorkspaceId)
        : null
    if (folder && folderExecutionHostId(folder) === binding.executionHostId) {
      cwd = folder.folderPath
    }
  } else {
    const parsed = splitWorktreeIdForFilesystem(binding.workspaceId)
    const ownerCount = parsed
      ? deps.workspaceStore
          .getRepos()
          .filter(
            (repo) =>
              repo.id === parsed.repoId && getRepoExecutionHostId(repo) === binding.executionHostId
          ).length
      : 0
    if (parsed && ownerCount === 1) {
      cwd = parsed.worktreePath
    }
  }
  if (!cwd || !isAbsoluteRuntimePath(cwd)) {
    throw new Error('barkos_test_workspace_authority_mismatch')
  }
  return { kind: 'direct', cwd, host }
}

async function runSshCommand(
  targetId: string,
  binary: string,
  args: string[],
  cwd: string,
  signal: AbortSignal
): Promise<BarkosTestEvidenceCommandResult> {
  const provider = getSshGitProvider(targetId)
  if (!provider) {
    throw new Error('barkos_test_ssh_unavailable')
  }
  const env = Object.fromEntries(
    Object.entries(gitCredentialPromptGuardEnv({})).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  )
  return provider.execNonInteractive(
    binary,
    args,
    cwd,
    BARKOS_TEST_EVIDENCE_TIMEOUT_MS,
    signal,
    env,
    'barkos-test-evidence'
  )
}

export async function runBarkosTestEvidence(
  deps: TestEvidenceRunnerDeps,
  request: BarkosTestEvidenceRunRequest,
  signal: AbortSignal
): Promise<BarkosTestEvidenceRunResult> {
  const plan = planBarkosTestEvidenceCommand(request.command)
  const authority = resolveExecutionAuthority(deps, request)
  signal.throwIfAborted()
  if (authority.kind === 'runtime') {
    if (!deps.runRuntime) {
      throw new Error('barkos_test_paired_runtime_unavailable')
    }
    return deps.runRuntime(authority.environmentId, authority.request, signal)
  }
  const startedAt = Date.now()
  const runLocal =
    deps.runLocal ??
    ((binary, args, cwd, runSignal) =>
      runBarkosLocalTestEvidenceCommand({ ...plan, binary, args }, cwd, runSignal))
  const runSsh = deps.runSsh ?? runSshCommand
  const result =
    authority.host.kind === 'ssh'
      ? await runSsh(authority.host.targetId, plan.binary, plan.args, authority.cwd, signal)
      : await runLocal(plan.binary, plan.args, authority.cwd, signal)
  if (signal.aborted || result.canceled) {
    throw new Error('barkos_test_run_cancelled')
  }
  return buildBarkosTestEvidenceResult(plan, result, startedAt)
}
