import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentHookServer, _internals } from './server'
import { buildBody, PANE } from './server.test-fixtures'

beforeEach(() => {
  _internals.resetCachesForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AgentHookServer Gemini BeforeTool HTTP decisions', () => {
  it('returns Gemini-compatible blocking and neutral JSON', async () => {
    const server = new AgentHookServer()
    await server.start({ env: 'production' })
    try {
      const evaluator = vi.fn((request) =>
        request.toolName === 'run_shell_command'
          ? { decision: 'deny' as const, reason: 'BarkOS approval required.' }
          : null
      )
      server.setToolUseDecisionEvaluator(evaluator)
      const env = server.buildPtyEnv()
      const headers = {
        'Content-Type': 'application/json',
        'X-Orca-Agent-Hook-Token': env.ORCA_AGENT_HOOK_TOKEN
      }
      const post = (payload: Record<string, unknown>) =>
        fetch(`http://127.0.0.1:${env.ORCA_AGENT_HOOK_PORT}/hook/gemini`, {
          method: 'POST',
          headers,
          body: JSON.stringify(
            buildBody(payload, {
              launchToken: 'gemini-launch-1',
              barkosSideEffectEnforcement: '1'
            })
          )
        })

      const denied = await post({
        hook_event_name: 'BeforeTool',
        tool_name: 'run_shell_command',
        tool_input: { command: 'git push origin main' },
        session_id: 'gemini-session-1'
      })
      expect(denied.status).toBe(200)
      expect(await denied.json()).toEqual({
        decision: 'deny',
        reason: 'BarkOS approval required.'
      })
      expect(evaluator).toHaveBeenCalledWith({
        source: 'gemini',
        paneKey: PANE,
        launchToken: 'gemini-launch-1',
        sideEffectEnforcement: true,
        toolName: 'run_shell_command',
        toolInput: { command: 'git push origin main' },
        providerSessionId: 'gemini-session-1'
      })

      const neutral = await post({ hook_event_name: 'AfterTool' })
      expect(neutral.status).toBe(200)
      expect(await neutral.json()).toEqual({})

      evaluator.mockImplementation(() => {
        throw new Error('persistence unavailable')
      })
      const evaluatorFailure = await post({
        hook_event_name: 'BeforeTool',
        tool_name: 'run_shell_command',
        tool_input: { command: 'git push origin main' }
      })
      expect(await evaluatorFailure.json()).toEqual({
        decision: 'deny',
        reason: expect.stringContaining('approval channel')
      })
    } finally {
      server.stop()
    }
  })
})
