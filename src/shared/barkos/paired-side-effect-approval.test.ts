import { describe, expect, it } from 'vitest'
import { createAgentHookSideEffectRelayResponse } from '../agent-hook-side-effect-relay'
import { makePaneKey } from '../stable-pane-id'
import {
  barkosPairedApprovalCapabilityForVersion,
  barkosPairedApprovalResolveMethod,
  barkosPairedApprovalSubscribeMethod,
  createBarkosPairedSideEffectApprovalDenial,
  parseBarkosPairedSideEffectApprovalEvent,
  parseBarkosPairedSideEffectApprovalResolution
} from './paired-side-effect-approval'

const paneKey = makePaneKey('tab-1', '11111111-1111-4111-8111-111111111111')

function event() {
  return {
    type: 'request',
    version: 1,
    requestId: 'request-1',
    request: {
      source: 'codex',
      paneKey,
      launchToken: 'launch-token',
      sideEffectEnforcement: true,
      toolName: 'shell',
      toolInput: { command: 'git push' }
    },
    authority: {
      runtimeId: 'runtime-1',
      worktreeId: 'worktree-1',
      terminalHandle: 'term-1',
      orchestrationRunId: 'run-1',
      orchestrationTaskId: 'task-1',
      orchestrationDispatchId: 'dispatch-1'
    }
  }
}

describe('paired BarkOS side-effect approval contract', () => {
  it('accepts bounded ready, request, and resolution frames', () => {
    expect(
      parseBarkosPairedSideEffectApprovalEvent({
        type: 'ready',
        version: 1,
        subscriptionId: 'subscription-1'
      })
    ).not.toBeNull()
    expect(parseBarkosPairedSideEffectApprovalEvent(event())).toEqual(event())
    expect(
      parseBarkosPairedSideEffectApprovalResolution({
        version: 1,
        requestId: 'request-1',
        response: createAgentHookSideEffectRelayResponse(true, null)
      })
    ).not.toBeNull()

    const droidEvent = {
      ...event(),
      version: 2,
      request: { ...event().request, source: 'droid' }
    }
    expect(parseBarkosPairedSideEffectApprovalEvent(droidEvent)).toEqual(droidEvent)
    expect(
      parseBarkosPairedSideEffectApprovalResolution({
        version: 2,
        requestId: 'request-2',
        response: createAgentHookSideEffectRelayResponse(true, null)
      })
    ).not.toBeNull()

    const geminiEvent = {
      ...event(),
      version: 3,
      request: {
        ...event().request,
        source: 'gemini',
        toolName: 'run_shell_command'
      }
    }
    expect(parseBarkosPairedSideEffectApprovalEvent(geminiEvent)).toEqual(geminiEvent)
    expect(
      parseBarkosPairedSideEffectApprovalResolution({
        version: 3,
        requestId: 'request-3',
        response: createAgentHookSideEffectRelayResponse(true, {
          decision: 'deny',
          reason: 'Blocked.'
        })
      })
    ).not.toBeNull()
    expect(createBarkosPairedSideEffectApprovalDenial('Blocked.', 'gemini')).toEqual({
      decision: 'deny',
      reason: 'Blocked.'
    })
    expect(barkosPairedApprovalCapabilityForVersion(3)).toBe(
      'barkos.paired-side-effect-approval.v3'
    )
    expect(barkosPairedApprovalSubscribeMethod(3)).toBe('barkos.sideEffectApproval.subscribeV3')
    expect(barkosPairedApprovalResolveMethod(3)).toBe('barkos.sideEffectApproval.resolveV3')

    const opencodeEvent = {
      ...event(),
      version: 4,
      request: { ...event().request, source: 'opencode' }
    }
    expect(parseBarkosPairedSideEffectApprovalEvent(opencodeEvent)).toEqual(opencodeEvent)
    expect(
      parseBarkosPairedSideEffectApprovalResolution({
        version: 4,
        requestId: 'request-4',
        response: createAgentHookSideEffectRelayResponse(true, null)
      })
    ).not.toBeNull()
    expect(barkosPairedApprovalCapabilityForVersion(4)).toBe(
      'barkos.paired-side-effect-approval.v4'
    )
    expect(barkosPairedApprovalSubscribeMethod(4)).toBe('barkos.sideEffectApproval.subscribeV4')
    expect(barkosPairedApprovalResolveMethod(4)).toBe('barkos.sideEffectApproval.resolveV4')
  })

  it('keeps newer providers out of older versions and rejects invalid frames', () => {
    expect(parseBarkosPairedSideEffectApprovalEvent({ ...event(), extra: true })).toBeNull()
    expect(
      parseBarkosPairedSideEffectApprovalEvent({
        ...event(),
        request: { ...event().request, paneKey: 'legacy:1' }
      })
    ).toBeNull()
    expect(
      parseBarkosPairedSideEffectApprovalEvent({
        ...event(),
        request: { ...event().request, source: 'droid' }
      })
    ).toBeNull()
    expect(
      parseBarkosPairedSideEffectApprovalEvent({
        ...event(),
        version: 2,
        request: { ...event().request, source: 'gemini' }
      })
    ).toBeNull()
    expect(
      parseBarkosPairedSideEffectApprovalEvent({
        ...event(),
        version: 3,
        request: { ...event().request, source: 'opencode' }
      })
    ).toBeNull()
  })
})
