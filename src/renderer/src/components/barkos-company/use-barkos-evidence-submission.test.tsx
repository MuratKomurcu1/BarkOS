// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBarkosCompany } from '../../../../shared/barkos/company'
import { parseBarkosWorkLedger, type BarkosWorkLedger } from '../../../../shared/barkos/work-ledger'
import type { BarkosWorkerSessionBinding } from '../../../../shared/barkos/worker-session'
import { useAppStore } from '@/store'
import {
  useBarkosEvidenceSubmission,
  type BarkosEvidenceSubmissionController
} from './use-barkos-evidence-submission'

const { readGit, readTerminal, runTest, cancelTest } = vi.hoisted(() => ({
  readGit: vi.fn(),
  readTerminal: vi.fn(),
  runTest: vi.fn(),
  cancelTest: vi.fn()
}))

vi.mock('@/lib/barkos-git-evidence', () => ({
  readFreshBarkosGitStatus: readGit
}))

vi.mock('@/lib/barkos-terminal-evidence', () => ({
  readBarkosTerminalEvidenceSnapshot: readTerminal
}))

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship reliable work.',
  leadName: 'Ada',
  now: 1
})
const leafId = '11111111-1111-4111-8111-111111111111'
const session: BarkosWorkerSessionBinding = {
  workerId: company.leadWorkerId,
  agent: 'codex',
  targetId: '5:localworkspace-main',
  workspaceId: 'workspace-main',
  workspaceKind: 'worktree',
  executionHostId: 'local',
  tabId: 'tab-worker',
  state: 'created',
  launchedAt: 2
}

function runningLedger(): BarkosWorkLedger {
  return parseBarkosWorkLedger({
    schemaVersion: 5,
    companyId: company.id,
    objectives: [
      {
        id: 'ship-release',
        companyId: company.id,
        title: 'Ship release',
        brief: 'Verify the release.',
        status: 'active',
        activePlanId: 'release-plan',
        orchestrationBinding: { runId: 'run-release', runtimeEnvironmentId: null },
        createdByWorkerId: company.leadWorkerId,
        createdAt: 1,
        updatedAt: 3
      }
    ],
    plans: [
      {
        id: 'release-plan',
        objectiveId: 'ship-release',
        version: 1,
        status: 'active',
        createdByWorkerId: company.leadWorkerId,
        tasks: [
          {
            id: 'verify-release',
            objectiveId: 'ship-release',
            planId: 'release-plan',
            title: 'Verify release',
            spec: 'Run release verification.',
            requiredCapabilities: [],
            dependencyIds: [],
            status: 'running',
            workspacePolicy: 'inherit',
            preferredEnvironmentId: null,
            risk: 'low',
            approvalPolicy: 'none',
            orchestrationTaskId: 'task-verify',
            createdAt: 1,
            updatedAt: 3
          }
        ],
        createdAt: 1,
        approvedAt: 1
      }
    ],
    assignments: [
      {
        id: 'verify-assignment',
        taskId: 'verify-release',
        workerId: company.leadWorkerId,
        status: 'dispatched',
        reason: 'Lead verification.',
        matchedCapabilities: [],
        activeLoadAtAssignment: 0,
        assignedAt: 2,
        approvedAt: 2
      }
    ],
    dispatches: [
      {
        id: 'verify-dispatch',
        assignmentId: 'verify-assignment',
        taskId: 'verify-release',
        workerId: company.leadWorkerId,
        attempt: 1,
        state: 'running',
        workspaceId: 'workspace-main',
        executionHostId: 'local',
        orchestrationRunId: 'run-release',
        orchestrationTaskId: 'task-verify',
        orchestrationDispatchId: 'dispatch-orca',
        memoryDelivery: null,
        stop: null,
        error: null,
        createdAt: 2,
        startedAt: 3,
        finishedAt: null
      }
    ],
    evidence: [],
    approvalGates: [],
    revision: 3,
    createdAt: 1,
    updatedAt: 3
  })
}

let root: Root | null = null
let controller: BarkosEvidenceSubmissionController | null = null
const originalApiDescriptor = Object.getOwnPropertyDescriptor(window, 'api')
const submitEvidence = vi.fn(() => Promise.resolve(runningLedger()))
const onMessage = vi.fn()

function Probe(): React.JSX.Element | null {
  controller = useBarkosEvidenceSubmission({ onMessage })
  return null
}

beforeEach(() => {
  readTerminal.mockReset().mockResolvedValue('\u001b[32mpnpm test\u001b[0m\npassed')
  readGit.mockReset().mockResolvedValue({
    entries: [{ path: 'src/fresh.ts', status: 'modified', area: 'unstaged', added: 3, removed: 1 }],
    branch: 'main',
    head: 'abc',
    conflictOperation: 'unknown'
  })
  submitEvidence.mockClear()
  onMessage.mockClear()
  runTest.mockReset().mockResolvedValue({
    version: 1,
    command: 'pnpm test',
    status: 'passed',
    summary: 'Exited with code 0.',
    durationMs: 10
  })
  cancelTest.mockReset().mockResolvedValue(true)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { barkosWorkLedger: { runTest, cancelTest } }
  })
  controller = null
  useAppStore.setState({
    barkosCompany: company,
    barkosWorkLedger: runningLedger(),
    barkosWorkLedgerLoadState: 'ready',
    barkosWorkerSessions: { [company.leadWorkerId]: session },
    agentStatusByPaneKey: {
      [`tab-worker:${leafId}`]: {
        state: 'done',
        prompt: '',
        updatedAt: 4,
        stateStartedAt: 4,
        agentType: 'codex',
        paneKey: `tab-worker:${leafId}`,
        terminalHandle: 'terminal-worker',
        tabId: 'tab-worker',
        stateHistory: []
      }
    },
    terminalLayoutsByTabId: {
      'tab-worker': {
        root: { type: 'leaf', leafId },
        activeLeafId: leafId,
        expandedLeafId: null,
        ptyIdsByLeafId: { [leafId]: 'pty-worker' }
      }
    },
    gitStatusByWorktree: {
      'workspace-main': [
        { path: 'src/release.ts', status: 'modified', area: 'unstaged', added: 2, removed: 1 }
      ]
    },
    gitStatusHugeByWorktree: {},
    submitBarkosWorkEvidence: submitEvidence
  })
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  controller = null
  document.body.innerHTML = ''
  if (originalApiDescriptor) {
    Object.defineProperty(window, 'api', originalApiDescriptor)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})

describe('useBarkosEvidenceSubmission', () => {
  it('collects read-only terminal and Git sources before explicit submission', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root?.render(<Probe />))

    await act(async () => controller?.open('verify-dispatch'))

    expect(readTerminal).toHaveBeenCalledWith('pty-worker')
    expect(readGit).toHaveBeenCalledWith(expect.any(Object), session, expect.any(AbortSignal))
    expect(controller?.draft).toMatchObject({
      dispatchId: 'verify-dispatch',
      gitSnapshotSource: 'fresh',
      changedFiles: [{ path: 'src/fresh.ts', change: 'modified' }],
      terminalEvidence: { excerpt: 'pnpm test\npassed' },
      collectingTerminal: false,
      collectingGit: false
    })
    expect(submitEvidence).not.toHaveBeenCalled()

    await act(async () =>
      controller?.submit({
        tests: [
          {
            command: 'pnpm test',
            status: 'passed',
            summary: 'Focused tests passed.',
            durationMs: 20
          }
        ],
        screenshots: [],
        diffSummary: 'Verified the release.',
        terminalExcerpt: controller?.draft?.terminalEvidence?.excerpt ?? '',
        risks: '',
        unresolvedDecisions: ''
      })
    )

    expect(submitEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatchId: 'verify-dispatch',
        capture: expect.objectContaining({
          tests: [expect.objectContaining({ command: 'pnpm test', status: 'passed' })],
          changedFiles: [expect.objectContaining({ path: 'src/fresh.ts' })],
          terminalExcerpts: [expect.objectContaining({ excerpt: 'pnpm test\npassed' })]
        })
      })
    )
  })

  it('falls back to the labeled cached Git snapshot when a fresh read fails', async () => {
    readGit.mockRejectedValueOnce(new Error('Git unavailable'))
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root?.render(<Probe />))

    await act(async () => controller?.open('verify-dispatch'))

    expect(controller?.draft).toMatchObject({
      gitSnapshotSource: 'cached',
      gitCapturedAt: null,
      changedFiles: [{ path: 'src/release.ts', change: 'modified' }],
      collectionNotices: ['Fresh Git status failed; the current cached snapshot is shown.']
    })
  })

  it('cancels an in-flight Git read when evidence collection closes', async () => {
    let observedSignal: AbortSignal | null = null
    let finishGit!: (value: null) => void
    readGit.mockImplementationOnce(
      (_state: unknown, _binding: unknown, signal: AbortSignal) =>
        new Promise<null>((resolve) => {
          observedSignal = signal
          finishGit = resolve
        })
    )
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root?.render(<Probe />))

    let pending!: Promise<void>
    await act(async () => {
      pending = controller?.open('verify-dispatch') ?? Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => controller?.close())

    expect((observedSignal ?? new AbortController().signal).aborted).toBe(true)
    finishGit(null)
    await act(async () => pending)
    expect(controller?.draft).toBeNull()
  })

  it('runs and cancels test evidence for the open dispatch only', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root?.render(<Probe />))
    await act(async () => controller?.open('verify-dispatch'))

    await expect(controller?.runTest('pnpm test')).resolves.toMatchObject({ status: 'passed' })
    expect(runTest).toHaveBeenCalledWith({
      version: 1,
      dispatchId: 'verify-dispatch',
      command: 'pnpm test'
    })

    await act(async () => controller?.close())
    expect(cancelTest).toHaveBeenCalledWith('verify-dispatch')
  })
})
