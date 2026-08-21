import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createHookListenerState,
  normalizeHookPayload,
  type HookListenerState
} from './agent-hook-listener'
import { clearGrokSessionPathLookupCacheForTests } from './grok-session-paths'
import { PANE_KEY } from './agent-hook-listener-test-harness'

describe('shared agent-hook-listener', () => {
  let state: HookListenerState

  beforeEach(() => {
    state = createHookListenerState()
  })

  afterEach(() => {
    clearGrokSessionPathLookupCacheForTests()
    vi.unstubAllEnvs()
  })

  function post(payload: Record<string, unknown>) {
    return normalizeHookPayload(
      state,
      'opencode',
      {
        paneKey: PANE_KEY,
        tabId: 'tab-1',
        worktreeId: 'wt',
        env: 'production',
        version: '1',
        payload
      },
      'production'
    )
  }

  it('normalizes an ordinary opencode PreToolUse to working with the tool snapshot', () => {
    const event = post({
      hook_event_name: 'PreToolUse',
      tool_name: 'bash',
      tool_input: { command: 'git push origin main' }
    })
    expect(event).not.toBeNull()
    expect(event!.payload.state).toBe('working')
    expect(event!.payload.toolName).toBe('bash')
    expect(event!.payload.toolInput).toContain('git push origin main')
    expect(event!.payload.agentType).toBe('opencode')
  })

  it.each(['question', 'ask_user_question', 'AskUserQuestion'] as const)(
    'normalizes an enforced %s PreToolUse to waiting so the gate is never denied as unknown',
    (toolName) => {
      const event = post({
        hook_event_name: 'PreToolUse',
        tool_name: toolName,
        tool_input: {}
      })
      // Why: enforced gates ride PreToolUse for every tool; a question tool must
      // normalize or the fail-closed server path would deny the agent's own ask.
      expect(event?.payload.state).toBe('waiting')
    }
  )
})
