import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { DispatchContextRow } from '../runtime/orchestration/types'
import { BARKOS_COMPANY_SCHEMA_VERSION, type BarkosCompany } from '../../shared/barkos/company'
import { makePaneKey } from '../../shared/stable-pane-id'
import { createEmptyBarkosWorkLedger, type BarkosWorkLedger } from '../../shared/barkos/work-ledger'
import { BarkosCompanyStore } from './company-store'
import { BarkosDecisionInboxStore } from './decision-inbox-store'
import { BarkosSideEffectApprovalController } from './side-effect-approval-controller'
import { BarkosWorkLedgerStore } from './work-ledger-store'

const LEAF_ID = '11111111-1111-4111-8111-111111111111'
const PANE = makePaneKey('tab-worker', LEAF_ID)
const REMINTED_PANE = makePaneKey('tab-reminted', LEAF_ID)
const LAUNCH_TOKEN = 'launch-token'

function company(agentId: 'claude' | 'codex' | 'droid' | 'gemini' = 'claude'): BarkosCompany {
  return {
    schemaVersion: BARKOS_COMPANY_SCHEMA_VERSION,
    id: 'company-1',
    name: 'BarkOS Labs',
    mission: 'Ship verified work.',
    leadWorkerId: 'lead-1',
    roles: [
      {
        id: 'lead',
        name: 'Lead',
        mission: 'Coordinate work.',
        capabilities: ['planning'],
        definitionOfDone: ['Work is verified.'],
        instructions: null
      },
      {
        id: 'engineer',
        name: 'Engineer',
        mission: 'Implement work.',
        capabilities: ['coding'],
        definitionOfDone: ['Tests pass.'],
        instructions: null
      }
    ],
    workers: [
      {
        id: 'lead-1',
        name: 'Ada',
        roleId: 'lead',
        agentId,
        model: null,
        preferredEnvironmentId: null,
        workspacePolicy: 'inherit',
        status: 'available'
      },
      {
        id: 'worker-1',
        name: 'Grace',
        roleId: 'engineer',
        agentId,
        model: null,
        preferredEnvironmentId: null,
        workspacePolicy: 'inherit',
        status: 'busy'
      }
    ],
    createdAt: 1,
    updatedAt: 1
  }
}

function runningLedger(): BarkosWorkLedger {
  return {
    ...createEmptyBarkosWorkLedger('company-1', 1),
    objectives: [
      {
        id: 'objective-1',
        companyId: 'company-1',
        title: 'Build',
        brief: 'Build the release.',
        status: 'active',
        activePlanId: 'plan-1',
        orchestrationBinding: { runId: 'run-1', runtimeEnvironmentId: null },
        createdByWorkerId: 'lead-1',
        createdAt: 1,
        updatedAt: 2
      }
    ],
    plans: [
      {
        id: 'plan-1',
        objectiveId: 'objective-1',
        version: 1,
        status: 'active',
        createdByWorkerId: 'lead-1',
        tasks: [
          {
            id: 'task-1',
            objectiveId: 'objective-1',
            planId: 'plan-1',
            title: 'Implement',
            spec: 'Implement and verify the release.',
            requiredCapabilities: [],
            dependencyIds: [],
            status: 'running',
            workspacePolicy: 'inherit',
            preferredEnvironmentId: null,
            risk: 'low',
            approvalPolicy: 'none',
            orchestrationTaskId: 'orca-task-1',
            createdAt: 1,
            updatedAt: 2
          }
        ],
        createdAt: 1,
        approvedAt: 1
      }
    ],
    assignments: [
      {
        id: 'assignment-1',
        taskId: 'task-1',
        workerId: 'worker-1',
        status: 'dispatched',
        reason: 'Best match.',
        matchedCapabilities: [],
        activeLoadAtAssignment: 0,
        assignedAt: 2,
        approvedAt: 2
      }
    ],
    dispatches: [
      {
        id: 'dispatch-1',
        assignmentId: 'assignment-1',
        taskId: 'task-1',
        workerId: 'worker-1',
        attempt: 1,
        state: 'running',
        workspaceId: 'workspace-1',
        executionHostId: 'local',
        orchestrationRunId: 'run-1',
        orchestrationTaskId: 'orca-task-1',
        orchestrationDispatchId: 'orca-dispatch-1',
        memoryDelivery: null,
        stop: null,
        error: null,
        createdAt: 2,
        startedAt: 3,
        finishedAt: null
      }
    ],
    revision: 1,
    updatedAt: 3
  }
}

function activeDispatch(paneKey = PANE): DispatchContextRow {
  return {
    id: 'orca-dispatch-1',
    run_id: 'run-1',
    task_id: 'orca-task-1',
    contract_version: 1,
    launch_token_hash: createHash('sha256').update(LAUNCH_TOKEN).digest('hex'),
    assignee_handle: 'term-worker',
    assignee_pane_key: paneKey,
    capability_hash: null,
    process_incarnation: null,
    capability_revoked_at: null,
    status: 'dispatched',
    failure_count: 0,
    last_failure: null,
    dispatched_at: null,
    completed_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    last_heartbeat_at: null
  }
}

function runtime(row = activeDispatch()): OrcaRuntimeService {
  return {
    getAgentStatusTerminalHandleForPaneKey: vi.fn(() => 'term-worker'),
    getOrchestrationDb: vi.fn(() => ({
      getActiveDispatchForIdentity: vi.fn(() => row)
    }))
  } as unknown as OrcaRuntimeService
}

function runtimeWithTransport(options: {
  connectionId: string | null
  wslDistro?: string
}): OrcaRuntimeService {
  return {
    getAgentStatusTerminalHandleForPaneKey: vi.fn(() => 'term-worker'),
    getOrchestrationDb: vi.fn(() => ({
      getActiveDispatchForIdentity: vi.fn(() => activeDispatch())
    })),
    resolveTerminalContext: vi.fn(() => ({
      worktreeId: 'workspace-1',
      connectionId: options.connectionId
    })),
    resolveProjectRuntimeForWorktree: vi.fn(() =>
      options.wslDistro
        ? {
            status: 'resolved',
            runtime: {
              kind: 'wsl',
              hostPlatform: 'wsl',
              projectId: 'project-1',
              distro: options.wslDistro,
              reason: 'project-override',
              cacheKey: 'wsl:test'
            }
          }
        : undefined
    )
  } as unknown as OrcaRuntimeService
}

function toolRequest(
  command: string,
  launchToken = LAUNCH_TOKEN,
  source: 'claude' | 'codex' | 'droid' | 'gemini' = 'claude',
  toolName = 'Bash'
) {
  return {
    source,
    paneKey: PANE,
    launchToken,
    sideEffectEnforcement: true as const,
    toolName,
    toolInput: { command }
  }
}

function permissionDecision(value: ReturnType<BarkosSideEffectApprovalController['evaluate']>) {
  return value && 'decision' in value
    ? value.decision
    : value?.hookSpecificOutput.permissionDecision
}

function permissionReason(value: ReturnType<BarkosSideEffectApprovalController['evaluate']>) {
  return value && 'decision' in value
    ? value.reason
    : value?.hookSpecificOutput.permissionDecisionReason
}

let userDataPath: string
let now: number

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'barkos-side-effect-controller-'))
  now = 100
  new BarkosCompanyStore(userDataPath).save(company())
  new BarkosWorkLedgerStore(userDataPath).save(runningLedger(), company())
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(userDataPath, { recursive: true, force: true })
})

describe('BarkOS side-effect approval controller', () => {
  it('does not intercept ordinary local work', () => {
    const controller = new BarkosSideEffectApprovalController(userDataPath, runtime(), () => now)

    expect(controller.evaluate(toolRequest('pnpm test'))).toBeNull()
    expect(new BarkosDecisionInboxStore(userDataPath).load(company())).toBeNull()
  })

  it('does not intercept a session without the BarkOS enforcement marker', () => {
    const controller = new BarkosSideEffectApprovalController(userDataPath, runtime(), () => now)

    expect(
      controller.evaluate({
        ...toolRequest('rm -rf build'),
        sideEffectEnforcement: undefined
      })
    ).toBeNull()
    expect(new BarkosDecisionInboxStore(userDataPath).load(company())).toBeNull()
  })

  it('blocks and durably records a classified side effect', () => {
    const controller = new BarkosSideEffectApprovalController(userDataPath, runtime(), () => now)

    const result = controller.evaluate(toolRequest('rm -rf build'))
    const inbox = new BarkosDecisionInboxStore(userDataPath).load(company())

    expect(permissionDecision(result)).toBe('deny')
    expect(inbox?.requests[0]).toMatchObject({
      sourceKind: 'side-effect',
      status: 'pending',
      dispatchId: 'dispatch-1',
      orchestrationDispatchId: 'orca-dispatch-1',
      details: 'Bash: rm -rf build'
    })
  })

  it('consumes one exact approval and requires a new approval for replay', () => {
    const controller = new BarkosSideEffectApprovalController(userDataPath, runtime(), () => now)
    const request = toolRequest('rm -rf build')
    expect(permissionDecision(controller.evaluate(request))).toBe('deny')
    const pending = new BarkosDecisionInboxStore(userDataPath).load(company())!.requests[0]

    now += 1
    controller.resolve(pending.id, 'approved')
    now += 1
    expect(permissionDecision(controller.evaluate(request))).toBe('allow')
    expect(
      new BarkosDecisionInboxStore(userDataPath).load(company())!.requests[0].sideEffect?.consumedAt
    ).toBe(now)

    now += 1
    expect(permissionDecision(controller.evaluate(request))).toBe('deny')
    const replayInbox = new BarkosDecisionInboxStore(userDataPath).load(company())!
    expect(replayInbox.requests).toHaveLength(2)
    expect(replayInbox.requests[0]).toMatchObject({ status: 'pending' })
  })

  it('uses neutral Codex output for the one exact approved retry', () => {
    const codexCompany = company('codex')
    new BarkosCompanyStore(userDataPath).save(codexCompany)
    const controller = new BarkosSideEffectApprovalController(userDataPath, runtime(), () => now)
    const request = toolRequest('git push origin main', LAUNCH_TOKEN, 'codex')

    expect(permissionDecision(controller.evaluate(request))).toBe('deny')
    const pending = new BarkosDecisionInboxStore(userDataPath).load(codexCompany)!.requests[0]
    controller.resolve(pending.id, 'approved')

    now += 1
    expect(controller.evaluate(request)).toBeNull()
    expect(
      new BarkosDecisionInboxStore(userDataPath).load(codexCompany)!.requests[0].sideEffect
        ?.consumedAt
    ).toBe(now)

    now += 1
    expect(permissionDecision(controller.evaluate(request))).toBe('deny')
  })

  it('blocks and consumes one exact local Droid Execute approval', () => {
    const droidCompany = company('droid')
    new BarkosCompanyStore(userDataPath).save(droidCompany)
    const controller = new BarkosSideEffectApprovalController(userDataPath, runtime(), () => now)
    const request = toolRequest('git push origin main', LAUNCH_TOKEN, 'droid', 'Execute')

    expect(permissionDecision(controller.evaluate(request))).toBe('deny')
    const pending = new BarkosDecisionInboxStore(userDataPath).load(droidCompany)!.requests[0]
    expect(pending.details).toBe('Execute: git push origin main')
    controller.resolve(pending.id, 'approved')

    now += 1
    expect(permissionDecision(controller.evaluate(request))).toBe('allow')
    expect(
      new BarkosDecisionInboxStore(userDataPath).load(droidCompany)!.requests[0].sideEffect
        ?.consumedAt
    ).toBe(now)
  })

  it('uses Gemini BeforeTool decisions for one exact local approval', () => {
    const geminiCompany = company('gemini')
    new BarkosCompanyStore(userDataPath).save(geminiCompany)
    const controller = new BarkosSideEffectApprovalController(userDataPath, runtime(), () => now)
    const request = toolRequest('git push origin main', LAUNCH_TOKEN, 'gemini', 'run_shell_command')

    expect(controller.evaluate(request)).toEqual({
      decision: 'deny',
      reason: expect.stringContaining('explicit approval')
    })
    const pending = new BarkosDecisionInboxStore(userDataPath).load(geminiCompany)!.requests[0]
    controller.resolve(pending.id, 'approved')

    now += 1
    expect(controller.evaluate(request)).toEqual({ decision: 'allow' })
  })

  it('does not apply approval to changed input', () => {
    const controller = new BarkosSideEffectApprovalController(userDataPath, runtime(), () => now)
    controller.evaluate(toolRequest('rm -rf build'))
    const pending = new BarkosDecisionInboxStore(userDataPath).load(company())!.requests[0]
    controller.resolve(pending.id, 'approved')

    expect(permissionDecision(controller.evaluate(toolRequest('rm -rf dist')))).toBe('deny')
    const inbox = new BarkosDecisionInboxStore(userDataPath).load(company())!
    expect(inbox.requests).toHaveLength(2)
    expect(inbox.requests[1].sideEffect?.consumedAt).toBeNull()
  })

  it('keeps a rejected exact action blocked without generating a replacement', () => {
    const controller = new BarkosSideEffectApprovalController(userDataPath, runtime(), () => now)
    const request = toolRequest('git push origin main')
    controller.evaluate(request)
    const pending = new BarkosDecisionInboxStore(userDataPath).load(company())!.requests[0]
    controller.resolve(pending.id, 'rejected')

    const result = controller.evaluate(request)
    const inbox = new BarkosDecisionInboxStore(userDataPath).load(company())!

    expect(permissionDecision(result)).toBe('deny')
    expect(permissionReason(result)).toContain('user rejected')
    expect(inbox.requests).toHaveLength(1)
  })

  it('accepts a reminted tab key only when its stable leaf and token match', () => {
    const controller = new BarkosSideEffectApprovalController(
      userDataPath,
      runtime(activeDispatch(REMINTED_PANE)),
      () => now
    )

    expect(permissionDecision(controller.evaluate(toolRequest('git push origin main')))).toBe(
      'deny'
    )
    expect(new BarkosDecisionInboxStore(userDataPath).load(company())?.requests).toHaveLength(1)
  })

  it('blocks an unverifiable launch identity without creating an approval', () => {
    const controller = new BarkosSideEffectApprovalController(userDataPath, runtime(), () => now)

    const result = controller.evaluate(toolRequest('rm -rf build', 'wrong-token'))

    expect(permissionDecision(result)).toBe('deny')
    expect(permissionReason(result)).toContain('identity')
    expect(new BarkosDecisionInboxStore(userDataPath).load(company())).toBeNull()
  })

  it('blocks an enforced side effect when its provider does not own the worker', () => {
    const controller = new BarkosSideEffectApprovalController(userDataPath, runtime(), () => now)

    const result = controller.evaluate(toolRequest('git push origin main', LAUNCH_TOKEN, 'codex'))

    expect(permissionDecision(result)).toBe('deny')
    expect(permissionReason(result)).toContain('active Dispatch')
    expect(new BarkosDecisionInboxStore(userDataPath).load(company())).toBeNull()
  })

  it('matches and persists a side effect only through the owning SSH transport', () => {
    const ledger = runningLedger()
    ledger.dispatches[0]!.executionHostId = 'ssh:remote'
    ledger.revision = 2
    ledger.updatedAt = 4
    new BarkosWorkLedgerStore(userDataPath).save(ledger, company())
    const controller = new BarkosSideEffectApprovalController(
      userDataPath,
      runtimeWithTransport({ connectionId: 'remote' }),
      () => now
    )

    const result = controller.evaluateRemote({
      ...toolRequest('git push origin main'),
      connectionId: 'remote'
    })

    expect(result).toMatchObject({
      matched: true,
      decision: { hookSpecificOutput: { permissionDecision: 'deny' } }
    })
    expect(new BarkosDecisionInboxStore(userDataPath).load(company())?.requests).toHaveLength(1)
  })

  it('matches and persists a Droid Execute side effect through its owning SSH transport', () => {
    const droidCompany = company('droid')
    const ledger = runningLedger()
    ledger.dispatches[0]!.executionHostId = 'ssh:remote'
    ledger.revision = 2
    ledger.updatedAt = 4
    new BarkosCompanyStore(userDataPath).save(droidCompany)
    new BarkosWorkLedgerStore(userDataPath).save(ledger, droidCompany)
    const controller = new BarkosSideEffectApprovalController(
      userDataPath,
      runtimeWithTransport({ connectionId: 'remote' }),
      () => now
    )

    const result = controller.evaluateRemote({
      ...toolRequest('git push origin main', LAUNCH_TOKEN, 'droid', 'Execute'),
      connectionId: 'remote'
    })

    expect(result).toMatchObject({
      matched: true,
      decision: { hookSpecificOutput: { permissionDecision: 'deny' } }
    })
    expect(new BarkosDecisionInboxStore(userDataPath).load(droidCompany)?.requests).toHaveLength(1)
  })

  it('matches and persists a Gemini BeforeTool side effect through its owning SSH transport', () => {
    const geminiCompany = company('gemini')
    const ledger = runningLedger()
    ledger.dispatches[0]!.executionHostId = 'ssh:remote'
    ledger.revision = 2
    ledger.updatedAt = 4
    new BarkosCompanyStore(userDataPath).save(geminiCompany)
    new BarkosWorkLedgerStore(userDataPath).save(ledger, geminiCompany)
    const controller = new BarkosSideEffectApprovalController(
      userDataPath,
      runtimeWithTransport({ connectionId: 'remote' }),
      () => now
    )

    const result = controller.evaluateRemote({
      ...toolRequest('git push origin main', LAUNCH_TOKEN, 'gemini', 'run_shell_command'),
      connectionId: 'remote'
    })

    expect(result).toMatchObject({
      matched: true,
      decision: { decision: 'deny', reason: expect.stringContaining('explicit approval') }
    })
    expect(new BarkosDecisionInboxStore(userDataPath).load(geminiCompany)?.requests).toHaveLength(1)
  })

  it('returns unmatched when an SSH relay does not own the Dispatch host', () => {
    const controller = new BarkosSideEffectApprovalController(
      userDataPath,
      runtimeWithTransport({ connectionId: 'other-remote' }),
      () => now
    )

    expect(
      controller.evaluateRemote({
        ...toolRequest('git push origin main'),
        connectionId: 'remote'
      })
    ).toEqual({ version: 1, matched: false, decision: null })
  })

  it('matches a WSL relay only to the terminal worktree runtime and stays neutral for safe work', () => {
    const controller = new BarkosSideEffectApprovalController(
      userDataPath,
      runtimeWithTransport({ connectionId: null, wslDistro: 'Ubuntu' }),
      () => now
    )

    expect(
      controller.evaluateRemote({ ...toolRequest('pnpm test'), connectionId: 'wsl:ubuntu' })
    ).toEqual({ version: 1, matched: true, decision: null })
    expect(new BarkosDecisionInboxStore(userDataPath).load(company())).toBeNull()
  })

  it('records and consumes approval for an authenticated paired runtime Dispatch', () => {
    const ledger = runningLedger()
    ledger.dispatches[0]!.executionHostId = 'runtime:env-1'
    ledger.revision = 2
    ledger.updatedAt = 4
    new BarkosWorkLedgerStore(userDataPath).save(ledger, company())
    const controller = new BarkosSideEffectApprovalController(userDataPath, runtime(), () => now)
    const args = {
      request: toolRequest('git push origin main'),
      environmentId: 'env-1',
      expectedRuntimeId: 'runtime-1',
      approvalVersion: 1 as const,
      authority: {
        runtimeId: 'runtime-1',
        worktreeId: 'workspace-1',
        terminalHandle: 'term-worker',
        orchestrationRunId: 'run-1',
        orchestrationTaskId: 'orca-task-1',
        orchestrationDispatchId: 'orca-dispatch-1'
      }
    }

    expect(controller.evaluatePaired(args)).toMatchObject({
      matched: true,
      decision: { hookSpecificOutput: { permissionDecision: 'deny' } }
    })
    const pending = new BarkosDecisionInboxStore(userDataPath).load(company())!.requests[0]
    controller.resolve(pending.id, 'approved')
    now += 1
    expect(controller.evaluatePaired(args)).toMatchObject({
      matched: true,
      decision: { hookSpecificOutput: { permissionDecision: 'allow' } }
    })
  })

  it('keeps Droid outside the v1 paired authority contract', () => {
    const controller = new BarkosSideEffectApprovalController(userDataPath, runtime(), () => now)

    expect(
      controller.evaluatePaired({
        request: toolRequest('git push origin main', LAUNCH_TOKEN, 'droid', 'Execute'),
        environmentId: 'env-1',
        expectedRuntimeId: 'runtime-1',
        approvalVersion: 1,
        authority: {
          runtimeId: 'runtime-1',
          worktreeId: 'workspace-1',
          terminalHandle: 'term-worker',
          orchestrationRunId: 'run-1',
          orchestrationTaskId: 'orca-task-1',
          orchestrationDispatchId: 'orca-dispatch-1'
        }
      })
    ).toEqual({ version: 1, matched: false, decision: null })
  })

  it('keeps Gemini outside v2 and uses its v3 decision schema', () => {
    const geminiCompany = company('gemini')
    new BarkosCompanyStore(userDataPath).save(geminiCompany)
    const ledger = runningLedger()
    ledger.dispatches[0]!.executionHostId = 'runtime:env-1'
    ledger.revision = 2
    ledger.updatedAt = 4
    new BarkosWorkLedgerStore(userDataPath).save(ledger, geminiCompany)
    const controller = new BarkosSideEffectApprovalController(userDataPath, runtime(), () => now)
    const args = {
      request: toolRequest(
        'git push origin main',
        LAUNCH_TOKEN,
        'gemini' as const,
        'run_shell_command'
      ),
      environmentId: 'env-1',
      expectedRuntimeId: 'runtime-1',
      authority: {
        runtimeId: 'runtime-1',
        worktreeId: 'workspace-1',
        terminalHandle: 'term-worker',
        orchestrationRunId: 'run-1',
        orchestrationTaskId: 'orca-task-1',
        orchestrationDispatchId: 'orca-dispatch-1'
      }
    }

    expect(controller.evaluatePaired({ ...args, approvalVersion: 2 })).toEqual({
      version: 1,
      matched: false,
      decision: null
    })
    expect(controller.evaluatePaired({ ...args, approvalVersion: 3 })).toMatchObject({
      matched: true,
      decision: { decision: 'deny', reason: expect.stringContaining('explicit approval') }
    })
    const pending = new BarkosDecisionInboxStore(userDataPath).load(geminiCompany)!.requests[0]
    controller.resolve(pending.id, 'approved')
    now += 1
    expect(controller.evaluatePaired({ ...args, approvalVersion: 3 })).toMatchObject({
      matched: true,
      decision: { decision: 'allow' }
    })
  })

  it('rejects paired authority from a different runtime generation', () => {
    const controller = new BarkosSideEffectApprovalController(userDataPath, runtime(), () => now)

    expect(
      controller.evaluatePaired({
        request: toolRequest('git push origin main'),
        environmentId: 'env-1',
        expectedRuntimeId: 'runtime-current',
        approvalVersion: 1,
        authority: {
          runtimeId: 'runtime-stale',
          worktreeId: 'workspace-1',
          terminalHandle: 'term-worker',
          orchestrationRunId: 'run-1',
          orchestrationTaskId: 'orca-task-1',
          orchestrationDispatchId: 'orca-dispatch-1'
        }
      })
    ).toMatchObject({
      matched: true,
      decision: { hookSpecificOutput: { permissionDecision: 'deny' } }
    })
    expect(new BarkosDecisionInboxStore(userDataPath).load(company())).toBeNull()
  })

  it('fails closed when approval persistence fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(BarkosDecisionInboxStore.prototype, 'mutate').mockImplementation(() => {
      throw new Error('disk unavailable')
    })
    const controller = new BarkosSideEffectApprovalController(userDataPath, runtime(), () => now)

    const result = controller.evaluate(toolRequest('rm -rf build'))

    expect(permissionDecision(result)).toBe('deny')
    expect(permissionReason(result)).toContain('could not persist')
  })
})
