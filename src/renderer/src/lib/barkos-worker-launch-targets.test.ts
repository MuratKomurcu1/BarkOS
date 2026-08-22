import { describe, expect, it } from 'vitest'
import type { BarkosWorker } from '../../../shared/barkos/company'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { BarkosWorkerLaunchTargetState } from './barkos-worker-launch-targets'
import {
  collectBarkosWorkerLaunchTargets,
  explainBarkosWorkerTargetGap,
  pickDefaultBarkosWorkerLaunchTarget
} from './barkos-worker-launch-targets'

function worker(overrides: Partial<BarkosWorker> = {}): BarkosWorker {
  return {
    id: 'ada',
    name: 'Ada',
    roleId: 'lead',
    agentId: 'codex',
    model: null,
    preferredEnvironmentId: null,
    workspacePolicy: 'inherit',
    status: 'available',
    ...overrides
  }
}

function state(): BarkosWorkerLaunchTargetState {
  return {
    detectedAgentIds: ['codex'],
    remoteDetectedAgentIds: { remote: ['codex'] },
    runtimeDetectedAgentIds: { server: ['codex'] },
    disabledTuiAgents: [],
    runtimeEnvironments: [{ id: 'server', name: 'Build server' }] as never,
    sshTargetLabels: new Map([['remote', 'Production SSH']]),
    repos: [
      {
        id: 'local-repo',
        path: '/local',
        displayName: 'Local project',
        badgeColor: 'blue',
        addedAt: 1,
        connectionId: null
      },
      {
        id: 'ssh-repo',
        path: '/remote',
        displayName: 'SSH project',
        badgeColor: 'blue',
        addedAt: 1,
        connectionId: 'remote'
      },
      {
        id: 'runtime-repo',
        path: '/runtime',
        displayName: 'Runtime project',
        badgeColor: 'blue',
        addedAt: 1,
        connectionId: null,
        executionHostId: 'runtime:server'
      }
    ],
    worktreesByRepo: {
      'local-repo': [
        {
          id: 'main',
          repoId: 'local-repo',
          displayName: 'main',
          comment: '',
          linkedIssue: null,
          linkedPR: null,
          linkedLinearIssue: null,
          linkedGitLabMR: null,
          linkedGitLabIssue: null,
          isArchived: false,
          isUnread: false,
          isPinned: false,
          sortOrder: 0,
          lastActivityAt: 0,
          path: '/local',
          head: 'main',
          branch: 'main',
          isBare: false,
          isMainWorktree: true
        },
        {
          id: 'feature',
          repoId: 'local-repo',
          displayName: 'feature',
          comment: '',
          linkedIssue: null,
          linkedPR: null,
          linkedLinearIssue: null,
          linkedGitLabMR: null,
          linkedGitLabIssue: null,
          isArchived: false,
          isUnread: false,
          isPinned: false,
          sortOrder: 1,
          lastActivityAt: 0,
          path: '/local-feature',
          head: 'feature',
          branch: 'feature',
          isBare: false,
          isMainWorktree: false
        }
      ],
      'ssh-repo': [
        {
          id: 'ssh-main',
          repoId: 'ssh-repo',
          hostId: 'ssh:remote',
          displayName: 'remote-main',
          comment: '',
          linkedIssue: null,
          linkedPR: null,
          linkedLinearIssue: null,
          linkedGitLabMR: null,
          linkedGitLabIssue: null,
          isArchived: false,
          isUnread: false,
          isPinned: false,
          sortOrder: 0,
          lastActivityAt: 0,
          path: '/remote',
          head: 'main',
          branch: 'main',
          isBare: false,
          isMainWorktree: true
        }
      ],
      'runtime-repo': [
        {
          id: 'runtime-main',
          repoId: 'runtime-repo',
          hostId: 'runtime:server',
          displayName: 'runtime-main',
          comment: '',
          linkedIssue: null,
          linkedPR: null,
          linkedLinearIssue: null,
          linkedGitLabMR: null,
          linkedGitLabIssue: null,
          isArchived: false,
          isUnread: false,
          isPinned: false,
          sortOrder: 0,
          lastActivityAt: 0,
          path: '/runtime',
          head: 'main',
          branch: 'main',
          isBare: false,
          isMainWorktree: true
        }
      ]
    },
    projectGroups: [
      {
        id: 'docs-group',
        name: 'Documentation',
        parentPath: '/docs',
        connectionId: null,
        parentGroupId: null,
        createdFrom: 'manual',
        tabOrder: 0,
        isCollapsed: false,
        color: null,
        createdAt: 0,
        updatedAt: 0
      }
    ],
    folderWorkspaces: [
      {
        id: 'docs',
        projectGroupId: 'docs-group',
        name: 'Product docs',
        folderPath: '/docs/product',
        connectionId: null,
        linkedTask: null,
        comment: '',
        isArchived: false,
        isUnread: false,
        isPinned: false,
        sortOrder: 0,
        lastActivityAt: 0,
        createdAt: 0,
        updatedAt: 0
      }
    ]
  } as BarkosWorkerLaunchTargetState
}

describe('BarkOS worker launch targets', () => {
  it('keeps local and SSH targets host-aware and checks detected agents', () => {
    const targets = collectBarkosWorkerLaunchTargets(state(), worker())

    expect(targets.map((target) => [target.workspaceId, target.executionHostId])).toEqual([
      ['main', 'local'],
      ['feature', 'local'],
      ['ssh-main', 'ssh:remote'],
      ['runtime-main', 'runtime:server'],
      ['folder:docs', 'local']
    ])
    expect(targets.map((target) => target.workspacePath)).toEqual([
      '/local',
      '/local-feature',
      '/remote',
      '/runtime',
      '/docs/product'
    ])
    expect(targets.every((target) => target.agentAvailable)).toBe(true)
  })

  it('limits isolated workers to non-main worktrees', () => {
    const targets = collectBarkosWorkerLaunchTargets(
      state(),
      worker({ workspacePolicy: 'isolated-worktree' })
    )

    expect(targets.map((target) => [target.workspaceId, target.compatible])).toEqual([
      ['main', false],
      ['feature', true],
      ['ssh-main', false],
      ['runtime-main', false],
      ['folder:docs', false]
    ])
  })

  it('prefers the active eligible workspace', () => {
    const targets = collectBarkosWorkerLaunchTargets(state(), worker())

    expect(
      pickDefaultBarkosWorkerLaunchTarget(targets, worker(), 'ssh-main', 'ssh:remote')
    ).toMatchObject({ workspaceId: 'ssh-main', executionHostId: 'ssh:remote' })
  })

  it('prefers the worker runtime environment before the active workspace', () => {
    const preferredWorker = worker({ preferredEnvironmentId: 'server' })
    const targets = collectBarkosWorkerLaunchTargets(state(), preferredWorker)

    expect(
      pickDefaultBarkosWorkerLaunchTarget(targets, preferredWorker, 'main', 'local')
    ).toMatchObject({
      workspaceId: 'runtime-main',
      executionHostId: 'runtime:server',
      hostLabel: 'Build server'
    })
  })
})

describe('explainBarkosWorkerTargetGap', () => {
  it('reports no gap when a compatible target can launch the worker', () => {
    expect(explainBarkosWorkerTargetGap(state(), worker())).toBeNull()
  })

  it('reports no-workspace when nothing is registered yet', () => {
    const empty = { ...state(), repos: [], worktreesByRepo: {}, folderWorkspaces: [] }
    expect(explainBarkosWorkerTargetGap(empty, worker())).toEqual({ kind: 'no-workspace' })
  })

  it('reports a disabled agent before looking at workspaces', () => {
    const disabled = { ...state(), disabledTuiAgents: ['codex'] }
    expect(explainBarkosWorkerTargetGap(disabled, worker())).toEqual({
      kind: 'agent-disabled',
      agent: 'codex'
    })
  })

  it('names the missing agent and lists what detection found instead', () => {
    const withoutCodex = {
      ...state(),
      detectedAgentIds: ['claude', 'opencode'] as TuiAgent[],
      remoteDetectedAgentIds: {},
      runtimeDetectedAgentIds: {}
    }
    expect(explainBarkosWorkerTargetGap(withoutCodex, worker())).toEqual({
      kind: 'agent-not-detected',
      agent: 'codex',
      detected: ['claude', 'opencode']
    })
  })

  it("does not count another host's detection as availability for this workspace", () => {
    // codex exists locally but every current workspace is an SSH host without it.
    const remoteOnly = {
      ...state(),
      detectedAgentIds: ['codex'] as TuiAgent[],
      remoteDetectedAgentIds: { remote: ['claude'] as TuiAgent[] },
      runtimeDetectedAgentIds: {},
      folderWorkspaces: []
    }
    const sshOnlyState = {
      ...remoteOnly,
      repos: remoteOnly.repos.filter((repo) => repo.id === 'ssh-repo'),
      worktreesByRepo: { 'ssh-repo': remoteOnly.worktreesByRepo['ssh-repo'] }
    }
    expect(explainBarkosWorkerTargetGap(sshOnlyState, worker())).toMatchObject({
      kind: 'agent-not-detected',
      agent: 'codex'
    })
  })

  it('reports incompatibility when the agent runs somewhere but no target qualifies', () => {
    const isolated = worker({ workspacePolicy: 'isolated-worktree' })
    // Only the folder workspace remains visible to a folder-less policy check:
    // every workspace is incompatible for isolated workers except non-main worktrees.
    const foldersOnly = {
      ...state(),
      repos: [],
      worktreesByRepo: {},
      folderWorkspaces: state().folderWorkspaces
    }
    expect(explainBarkosWorkerTargetGap(foldersOnly, isolated)).toEqual({
      kind: 'workspace-incompatible',
      agent: 'codex'
    })
  })
})
