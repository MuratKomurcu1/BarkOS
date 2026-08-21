import { describe, expect, it } from 'vitest'
import { makePaneKey } from './stable-pane-id'
import {
  createAgentHookSideEffectRelayResponse,
  createAgentHookSideEffectTransportDenial,
  parseAgentHookSideEffectRelayRequest,
  parseAgentHookSideEffectRelayResponse
} from './agent-hook-side-effect-relay'

const paneKey = makePaneKey('tab-1', '11111111-1111-4111-8111-111111111111')

function request(source: 'codex' | 'droid' | 'gemini' = 'codex') {
  return {
    version: 1,
    barkosSideEffectEnforcement: true,
    envelope: {
      source,
      paneKey,
      connectionId: null,
      payload: { state: 'working', agentType: source, prompt: 'task' }
    },
    toolPayload: {
      hook_event_name: source === 'gemini' ? 'BeforeTool' : 'PreToolUse',
      tool_name: 'shell',
      tool_input: { command: 'git push' }
    }
  }
}

describe('agent hook side-effect relay contract', () => {
  it('accepts the versioned exact PreToolUse request', () => {
    expect(parseAgentHookSideEffectRelayRequest(request())).toEqual(request())
    expect(parseAgentHookSideEffectRelayRequest(request('droid'))).toEqual(request('droid'))
    expect(parseAgentHookSideEffectRelayRequest(request('gemini'))).toEqual(request('gemini'))
  })

  it('rejects unsupported versions, invalid pane identity, and non-tool events', () => {
    expect(parseAgentHookSideEffectRelayRequest({ ...request(), version: 2 })).toBeNull()
    expect(
      parseAgentHookSideEffectRelayRequest({
        ...request(),
        envelope: { ...request().envelope, paneKey: 'legacy:1' }
      })
    ).toBeNull()
    expect(
      parseAgentHookSideEffectRelayRequest({
        ...request(),
        toolPayload: { ...request().toolPayload, hook_event_name: 'PostToolUse' }
      })
    ).toBeNull()
  })

  it('round-trips matched decisions and rejects malformed responses', () => {
    const denial = createAgentHookSideEffectTransportDenial()
    const response = createAgentHookSideEffectRelayResponse(true, denial)
    expect(parseAgentHookSideEffectRelayResponse(response)).toEqual(response)
    expect(parseAgentHookSideEffectRelayResponse({ ...response, version: 2 })).toBeNull()
    expect(
      parseAgentHookSideEffectRelayResponse({ ...response, decision: { permission: 'deny' } })
    ).toBeNull()
  })

  it('uses Gemini BeforeTool decisions without changing PreToolUse decisions', () => {
    const denial = createAgentHookSideEffectTransportDenial('Approval unavailable.', 'gemini')
    const response = createAgentHookSideEffectRelayResponse(true, denial)

    expect(parseAgentHookSideEffectRelayResponse(response)).toEqual(response)
    expect(denial).toEqual({ decision: 'deny', reason: 'Approval unavailable.' })
    expect(createAgentHookSideEffectTransportDenial()).toMatchObject({
      hookSpecificOutput: { hookEventName: 'PreToolUse' }
    })
  })
})
