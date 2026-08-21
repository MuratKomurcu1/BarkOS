import { describe, expect, it, vi } from 'vitest'
import type { RelayDispatcher } from './dispatcher'
import { makePaneKey } from '../shared/stable-pane-id'
import { evaluateAgentHookSideEffectThroughDispatcher } from './agent-hook-side-effect-evaluator'

const request = {
  version: 1 as const,
  barkosSideEffectEnforcement: true as const,
  envelope: {
    source: 'claude' as const,
    paneKey: makePaneKey('tab-1', '11111111-1111-4111-8111-111111111111'),
    connectionId: null,
    payload: { state: 'working' as const, agentType: 'claude' as const, prompt: 'task' }
  },
  toolPayload: {
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'git push origin main' }
  }
}

function dispatcherWith(results: unknown[]): RelayDispatcher {
  return {
    requestActiveClients: vi.fn(async () =>
      results.map((result, index) => ({ clientId: index + 1, result }))
    )
  } as unknown as RelayDispatcher
}

describe('agent hook side-effect relay evaluator', () => {
  it('accepts exactly one matched client response', async () => {
    const decision = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse' as const,
        permissionDecision: 'deny' as const,
        permissionDecisionReason: 'Approval required.'
      }
    }

    await expect(
      evaluateAgentHookSideEffectThroughDispatcher(
        dispatcherWith([
          { version: 1, matched: false, decision: null },
          { version: 1, matched: true, decision }
        ]),
        request
      )
    ).resolves.toEqual({ version: 1, matched: true, decision })
  })

  it('fails unmatched for zero, multiple, or malformed ownership claims', async () => {
    const matched = { version: 1, matched: true, decision: null }
    await expect(
      evaluateAgentHookSideEffectThroughDispatcher(dispatcherWith([]), request)
    ).resolves.toEqual({ version: 1, matched: false, decision: null })
    await expect(
      evaluateAgentHookSideEffectThroughDispatcher(dispatcherWith([matched, matched]), request)
    ).resolves.toEqual({ version: 1, matched: false, decision: null })
    await expect(
      evaluateAgentHookSideEffectThroughDispatcher(
        dispatcherWith([{ version: 2, matched: true, decision: null }]),
        request
      )
    ).resolves.toEqual({ version: 1, matched: false, decision: null })
    await expect(
      evaluateAgentHookSideEffectThroughDispatcher(
        dispatcherWith([
          {
            version: 1,
            matched: true,
            decision: { decision: 'deny', reason: 'Wrong provider response.' }
          }
        ]),
        request
      )
    ).resolves.toEqual({ version: 1, matched: false, decision: null })
  })
})
