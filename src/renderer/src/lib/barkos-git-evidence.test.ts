import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'
import { toRuntimeExecutionHostId, toSshExecutionHostId } from '../../../shared/execution-host'
import {
  readFreshBarkosGitStatus,
  resolveBarkosGitEvidenceContext,
  type BarkosGitEvidenceWorkspaceState
} from './barkos-git-evidence'

const { getRuntimeGitStatus } = vi.hoisted(() => ({ getRuntimeGitStatus: vi.fn() }))

vi.mock('../runtime/runtime-git-client', () => ({ getRuntimeGitStatus }))

const state: BarkosGitEvidenceWorkspaceState = {
  repos: [{ id: 'repo-local' }, { id: 'repo-ssh', connectionId: 'server one' }],
  worktreesByRepo: {
    'repo-local': [{ id: 'workspace-local', path: '/workspace/local' }],
    'repo-ssh': [{ id: 'workspace-ssh', path: '/workspace/ssh' }]
  },
  folderWorkspaces: [
    {
      id: 'workspace-runtime',
      folderPath: '/workspace/runtime',
      executionHostId: toRuntimeExecutionHostId('environment-one')
    }
  ]
}

function binding(
  workspaceId: string,
  executionHostId: BarkosWorkerSessionBinding['executionHostId']
): BarkosWorkerSessionBinding {
  return {
    workerId: 'worker-one',
    agent: 'codex',
    targetId: `${executionHostId.length}:${executionHostId}${workspaceId}`,
    workspaceId,
    workspaceKind: workspaceId.startsWith('folder:') ? 'folder' : 'worktree',
    executionHostId,
    tabId: 'tab-one',
    state: 'created',
    launchedAt: 1
  }
}

beforeEach(() => {
  getRuntimeGitStatus.mockReset().mockResolvedValue({
    entries: [],
    branch: 'main',
    head: 'abc',
    conflictOperation: 'unknown'
  })
})

describe('BarkOS Git evidence routing', () => {
  it('routes local, SSH, and paired-runtime workspaces through their exact owner', () => {
    expect(resolveBarkosGitEvidenceContext(state, binding('workspace-local', 'local'))).toEqual({
      settings: { activeRuntimeEnvironmentId: null },
      worktreeId: 'workspace-local',
      worktreePath: '/workspace/local'
    })
    expect(
      resolveBarkosGitEvidenceContext(
        state,
        binding('workspace-ssh', toSshExecutionHostId('server one'))
      )
    ).toEqual({
      settings: { activeRuntimeEnvironmentId: null },
      worktreeId: 'workspace-ssh',
      worktreePath: '/workspace/ssh',
      connectionId: 'server one'
    })
    expect(
      resolveBarkosGitEvidenceContext(
        state,
        binding('folder:workspace-runtime', toRuntimeExecutionHostId('environment-one'))
      )
    ).toEqual({
      settings: { activeRuntimeEnvironmentId: 'environment-one' },
      worktreeId: 'folder:workspace-runtime',
      worktreePath: '/workspace/runtime'
    })
  })

  it('rejects a stale binding whose workspace now belongs to another host', () => {
    expect(
      resolveBarkosGitEvidenceContext(state, binding('workspace-local', 'ssh:other'))
    ).toBeNull()
  })

  it('performs a read-only status request with cancellation support', async () => {
    const controller = new AbortController()
    await expect(
      readFreshBarkosGitStatus(state, binding('workspace-local', 'local'), controller.signal)
    ).resolves.toMatchObject({ branch: 'main' })

    expect(getRuntimeGitStatus).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: '/workspace/local' }),
      { signal: controller.signal }
    )
  })
})
