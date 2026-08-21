import { describe, expect, it, vi } from 'vitest'
import { createAgentHookSideEffectRelayResponse } from '../../shared/agent-hook-side-effect-relay'
import type { BarkosPairedSideEffectApprovalEvent } from '../../shared/barkos/paired-side-effect-approval'
import { makePaneKey } from '../../shared/stable-pane-id'
import {
  BarkosPairedSideEffectApprovalBroker,
  type BarkosPairedSideEffectHostAuthority
} from './paired-side-effect-approval-broker'

const paneKey = makePaneKey('tab-1', '11111111-1111-4111-8111-111111111111')
const authority = {
  runtimeId: 'runtime-1',
  worktreeId: 'worktree-1',
  terminalHandle: 'term-1',
  orchestrationRunId: 'run-1',
  orchestrationTaskId: 'task-1',
  orchestrationDispatchId: 'dispatch-1'
}

function request(
  toolName = 'shell',
  toolInput: unknown = { command: 'git push' },
  source: 'codex' | 'droid' | 'gemini' = 'codex'
) {
  return {
    source,
    paneKey,
    launchToken: 'launch-token',
    sideEffectEnforcement: true as const,
    toolName,
    toolInput
  }
}

function broker(resolution: BarkosPairedSideEffectHostAuthority) {
  return new BarkosPairedSideEffectApprovalBroker(() => resolution)
}

describe('paired BarkOS side-effect approval broker', () => {
  it('handles read-only tools locally without publishing their inputs', async () => {
    const resolveAuthority = vi.fn(() => ({ status: 'unpaired' as const }))
    const value = new BarkosPairedSideEffectApprovalBroker(resolveAuthority)

    await expect(value.evaluate(request('read', { path: '/tmp/file' }))).resolves.toEqual(
      createAgentHookSideEffectRelayResponse(true, null)
    )
    expect(resolveAuthority).not.toHaveBeenCalled()
  })

  it('leaves classified unpaired requests for the local controller', async () => {
    await expect(broker({ status: 'unpaired' }).evaluate(request())).resolves.toEqual(
      createAgentHookSideEffectRelayResponse(false, null)
    )
  })

  it('routes a classified request only to its authenticated owner', async () => {
    const value = broker({ status: 'verified', ownerDeviceId: 'device-1', authority })
    const events: BarkosPairedSideEffectApprovalEvent[] = []
    value.subscribe('device-1', (event) => events.push(event))

    const evaluation = value.evaluate(request())
    const approvalRequest = events.find((event) => event.type === 'request')
    expect(approvalRequest).toMatchObject({
      type: 'request',
      request: { toolName: 'shell' },
      authority
    })
    if (!approvalRequest || approvalRequest.type !== 'request') {
      throw new Error('missing approval request')
    }
    expect(
      value.resolve('device-2', {
        version: 1,
        requestId: approvalRequest.requestId,
        response: createAgentHookSideEffectRelayResponse(true, null)
      })
    ).toBe(false)
    expect(
      value.resolve('device-1', {
        version: 1,
        requestId: approvalRequest.requestId,
        response: createAgentHookSideEffectRelayResponse(true, {
          decision: 'deny',
          reason: 'Wrong provider response.'
        })
      })
    ).toBe(false)
    expect(
      value.resolve('device-1', {
        version: 1,
        requestId: approvalRequest.requestId,
        response: createAgentHookSideEffectRelayResponse(true, null)
      })
    ).toBe(true)
    await expect(evaluation).resolves.toEqual(createAgentHookSideEffectRelayResponse(true, null))
  })

  it('denies verified workers when their owner channel is unavailable', async () => {
    const result = await broker({
      status: 'verified',
      ownerDeviceId: 'device-1',
      authority
    }).evaluate(request())

    expect(result).toMatchObject({
      matched: true,
      decision: { hookSpecificOutput: { permissionDecision: 'deny' } }
    })
  })

  it('routes Droid only through a v2 owner subscription', async () => {
    const value = broker({ status: 'verified', ownerDeviceId: 'device-1', authority })
    const v1Events: BarkosPairedSideEffectApprovalEvent[] = []
    value.subscribe('device-1', (event) => v1Events.push(event))

    await expect(
      value.evaluate(request('shell', { command: 'git push' }, 'droid'))
    ).resolves.toMatchObject({
      matched: true,
      decision: { hookSpecificOutput: { permissionDecision: 'deny' } }
    })
    expect(v1Events.some((event) => event.type === 'request')).toBe(false)

    const v2Events: BarkosPairedSideEffectApprovalEvent[] = []
    value.subscribe('device-1', (event) => v2Events.push(event), 2)
    const evaluation = value.evaluate(request('shell', { command: 'git push' }, 'droid'))
    const approval = v2Events.find((event) => event.type === 'request')
    expect(approval).toMatchObject({ version: 2, request: { source: 'droid' } })
    if (!approval || approval.type !== 'request') {
      throw new Error('missing Droid approval request')
    }
    expect(
      value.resolve('device-1', {
        version: 1,
        requestId: approval.requestId,
        response: createAgentHookSideEffectRelayResponse(true, null)
      })
    ).toBe(false)
    expect(
      value.resolve('device-1', {
        version: 2,
        requestId: approval.requestId,
        response: createAgentHookSideEffectRelayResponse(true, null)
      })
    ).toBe(true)
    await expect(evaluation).resolves.toEqual(createAgentHookSideEffectRelayResponse(true, null))
  })

  it('routes Gemini only through v3 and enforces its decision schema', async () => {
    const value = broker({ status: 'verified', ownerDeviceId: 'device-1', authority })
    const v2Events: BarkosPairedSideEffectApprovalEvent[] = []
    value.subscribe('device-1', (event) => v2Events.push(event), 2)

    await expect(
      value.evaluate(request('run_shell_command', { command: 'git push origin main' }, 'gemini'))
    ).resolves.toMatchObject({
      matched: true,
      decision: { decision: 'deny' }
    })
    expect(v2Events.some((event) => event.type === 'request')).toBe(false)

    const v3Events: BarkosPairedSideEffectApprovalEvent[] = []
    value.subscribe('device-1', (event) => v3Events.push(event), 3)
    const evaluation = value.evaluate(
      request('run_shell_command', { command: 'git push origin main' }, 'gemini')
    )
    const approval = v3Events.find((event) => event.type === 'request')
    expect(approval).toMatchObject({ version: 3, request: { source: 'gemini' } })
    if (!approval || approval.type !== 'request') {
      throw new Error('missing Gemini approval request')
    }
    expect(
      value.resolve('device-1', {
        version: 3,
        requestId: approval.requestId,
        response: createAgentHookSideEffectRelayResponse(true, {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: 'Wrong provider schema.'
          }
        })
      })
    ).toBe(false)
    expect(
      value.resolve('device-1', {
        version: 3,
        requestId: approval.requestId,
        response: createAgentHookSideEffectRelayResponse(true, {
          decision: 'allow'
        })
      })
    ).toBe(true)
    await expect(evaluation).resolves.toEqual(
      createAgentHookSideEffectRelayResponse(true, { decision: 'allow' })
    )
  })
})
