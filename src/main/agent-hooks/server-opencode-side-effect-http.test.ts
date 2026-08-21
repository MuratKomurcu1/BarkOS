import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentHookServer, _internals } from './server'
import { buildBody, PANE } from './server.test-fixtures'

beforeEach(() => {
  _internals.resetCachesForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AgentHookServer OpenCode side-effect HTTP decisions', () => {
  it('returns Claude-compatible blocking and neutral JSON for enforced PreToolUse', async () => {
    const server = new AgentHookServer()
    await server.start({ env: 'production' })
    try {
      const evaluator = vi.fn((request) =>
        request.toolName === 'bash'
          ? {
              hookSpecificOutput: {
                hookEventName: 'PreToolUse' as const,
                permissionDecision: 'deny' as const,
                permissionDecisionReason: 'Blocked by policy.'
              }
            }
          : null
      )
      server.setToolUseDecisionEvaluator(evaluator)
      const env = server.buildPtyEnv()
      const headers = {
        'Content-Type': 'application/json',
        'X-Orca-Agent-Hook-Token': env.ORCA_AGENT_HOOK_TOKEN
      }
      const post = (payload: Record<string, unknown>) =>
        fetch(`http://127.0.0.1:${env.ORCA_AGENT_HOOK_PORT}/hook/opencode`, {
          method: 'POST',
          headers,
          body: JSON.stringify(
            buildBody(payload, {
              launchToken: 'opencode-launch-1',
              barkosSideEffectEnforcement: '1'
            })
          )
        })

      const denied = await post({
        hook_event_name: 'PreToolUse',
        tool_name: 'bash',
        tool_input: { command: 'git push origin main' }
      })
      expect(denied.status).toBe(200)
      expect(await denied.json()).toEqual({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: 'Blocked by policy.'
        }
      })
      expect(evaluator).toHaveBeenCalledWith({
        source: 'opencode',
        paneKey: PANE,
        launchToken: 'opencode-launch-1',
        sideEffectEnforcement: true,
        toolName: 'bash',
        toolInput: { command: 'git push origin main' },
        providerSessionId: undefined
      })

      // Why: an approved call must still get an explicit JSON body — opencode's gate treats an empty enforced response as fail-closed.
      const neutral = await post({
        hook_event_name: 'PreToolUse',
        tool_name: 'read',
        tool_input: { path: '/tmp/a' }
      })
      expect(neutral.status).toBe(200)
      expect(await neutral.json()).toEqual({})

      evaluator.mockImplementation(() => {
        throw new Error('persistence unavailable')
      })
      const evaluatorFailure = await post({
        hook_event_name: 'PreToolUse',
        tool_name: 'bash',
        tool_input: { command: 'git push origin main' }
      })
      expect(evaluatorFailure.status).toBe(200)
      expect(await evaluatorFailure.json()).toEqual({
        hookSpecificOutput: {
          permissionDecision: 'deny',
          hookEventName: 'PreToolUse',
          permissionDecisionReason: expect.stringContaining('approval channel')
        }
      })
    } finally {
      server.stop()
    }
  })

  it('fails closed when an enforced request has no decision evaluator', async () => {
    const server = new AgentHookServer()
    await server.start({ env: 'production' })
    try {
      const env = server.buildPtyEnv()
      const denied = await fetch(`http://127.0.0.1:${env.ORCA_AGENT_HOOK_PORT}/hook/opencode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Orca-Agent-Hook-Token': env.ORCA_AGENT_HOOK_TOKEN
        },
        body: JSON.stringify(
          buildBody(
            { hook_event_name: 'PreToolUse', tool_name: 'bash', tool_input: {} },
            { barkosSideEffectEnforcement: '1', launchToken: 'opencode-launch-2' }
          )
        )
      })
      expect(denied.status).toBe(200)
      expect(await denied.json()).toEqual({
        hookSpecificOutput: {
          permissionDecision: 'deny',
          hookEventName: 'PreToolUse',
          permissionDecisionReason:
            'BarkOS could not verify the remote approval channel, so the side effect was blocked.'
        }
      })
    } finally {
      server.stop()
    }
  })

  it('fails closed when an enforced payload cannot normalize into a tool-use request', async () => {
    const server = new AgentHookServer()
    await server.start({ env: 'production' })
    try {
      const evaluator = vi.fn()
      server.setToolUseDecisionEvaluator(evaluator)
      const env = server.buildPtyEnv()
      // Why: a stale/aliased paneKey never resolves to a live tool-use request,
      // yet the plugin still blocks on the response — the denial must be explicit.
      const denied = await fetch(`http://127.0.0.1:${env.ORCA_AGENT_HOOK_PORT}/hook/opencode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Orca-Agent-Hook-Token': env.ORCA_AGENT_HOOK_TOKEN
        },
        body: JSON.stringify(
          buildBody(
            { hook_event_name: 'PreToolUse', tool_name: 'bash', tool_input: {} },
            {
              paneKey: 'legacy:1',
              barkosSideEffectEnforcement: '1',
              launchToken: 'opencode-launch-3'
            }
          )
        )
      })
      expect(denied.status).toBe(200)
      expect(await denied.json()).toEqual({
        hookSpecificOutput: {
          permissionDecision: 'deny',
          hookEventName: 'PreToolUse',
          permissionDecisionReason:
            'BarkOS could not verify the remote approval channel, so the side effect was blocked.'
        }
      })
      expect(evaluator).not.toHaveBeenCalled()
    } finally {
      server.stop()
    }
  })

  it('keeps unenforced opencode status events fail-open with no body', async () => {
    const server = new AgentHookServer()
    await server.start({ env: 'production' })
    try {
      const env = server.buildPtyEnv()
      const accepted = await fetch(`http://127.0.0.1:${env.ORCA_AGENT_HOOK_PORT}/hook/opencode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Orca-Agent-Hook-Token': env.ORCA_AGENT_HOOK_TOKEN
        },
        body: JSON.stringify(
          buildBody(
            { hook_event_name: 'SessionIdle', sessionID: 'oc-session-1' },
            { launchToken: 'opencode-launch-4' }
          )
        )
      })
      expect(accepted.status).toBe(204)
      expect(await accepted.text()).toBe('')
    } finally {
      server.stop()
    }
  })
})
