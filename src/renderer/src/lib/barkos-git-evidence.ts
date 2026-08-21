import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'
import {
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  parseExecutionHostId,
  toSshExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host'
import type { GitStatusResult } from '../../../shared/git-status-types'
import { folderWorkspaceKey } from '../../../shared/workspace-scope'
import { getRuntimeGitStatus, type RuntimeGitContext } from '../runtime/runtime-git-client'

type EvidenceWorktree = {
  id: string
  path: string
  hostId?: ExecutionHostId
}

type EvidenceRepo = {
  id: string
  connectionId?: string | null
  executionHostId?: ExecutionHostId | null
}

type EvidenceFolderWorkspace = {
  id: string
  folderPath: string
  connectionId?: string | null
  executionHostId?: ExecutionHostId | null
}

export type BarkosGitEvidenceWorkspaceState = {
  repos: readonly EvidenceRepo[]
  worktreesByRepo: Readonly<Record<string, readonly EvidenceWorktree[]>>
  folderWorkspaces: readonly EvidenceFolderWorkspace[]
}

function repoExecutionHost(repo: EvidenceRepo | undefined): ExecutionHostId {
  return (
    normalizeExecutionHostId(repo?.executionHostId) ??
    (repo?.connectionId ? toSshExecutionHostId(repo.connectionId) : LOCAL_EXECUTION_HOST_ID)
  )
}

function findBoundWorkspace(
  state: BarkosGitEvidenceWorkspaceState,
  binding: BarkosWorkerSessionBinding
): { path: string; executionHostId: ExecutionHostId } | null {
  for (const [repoId, worktrees] of Object.entries(state.worktreesByRepo)) {
    const worktree = worktrees.find((entry) => entry.id === binding.workspaceId)
    if (worktree) {
      const repo = state.repos.find((entry) => entry.id === repoId)
      return {
        path: worktree.path,
        executionHostId: normalizeExecutionHostId(worktree.hostId) ?? repoExecutionHost(repo)
      }
    }
  }
  const folder = state.folderWorkspaces.find(
    (entry) => folderWorkspaceKey(entry.id) === binding.workspaceId
  )
  return folder
    ? {
        path: folder.folderPath,
        executionHostId:
          normalizeExecutionHostId(folder.executionHostId) ??
          (folder.connectionId
            ? toSshExecutionHostId(folder.connectionId)
            : LOCAL_EXECUTION_HOST_ID)
      }
    : null
}

export function resolveBarkosGitEvidenceContext(
  state: BarkosGitEvidenceWorkspaceState,
  binding: BarkosWorkerSessionBinding
): RuntimeGitContext | null {
  const workspace = findBoundWorkspace(state, binding)
  const host = parseExecutionHostId(binding.executionHostId)
  if (!workspace || !host || workspace.executionHostId !== binding.executionHostId) {
    return null
  }
  return {
    settings: {
      activeRuntimeEnvironmentId: host.kind === 'runtime' ? host.environmentId : null
    },
    worktreeId: binding.workspaceId,
    worktreePath: workspace.path,
    ...(host.kind === 'ssh' ? { connectionId: host.targetId } : {})
  }
}

export async function readFreshBarkosGitStatus(
  state: BarkosGitEvidenceWorkspaceState,
  binding: BarkosWorkerSessionBinding,
  signal?: AbortSignal
): Promise<GitStatusResult | null> {
  const context = resolveBarkosGitEvidenceContext(state, binding)
  return context ? getRuntimeGitStatus(context, { signal }) : null
}
