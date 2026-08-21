/**
 * Executes the generated OpenCode plugin source because the side-effect gate
 * lives inside OpenCode's process: it must block by throwing on a structured
 * deny decision, allow on a neutral body, and fail CLOSED on any transport
 * ambiguity so an unreachable approval service can never wave a side effect
 * through while BarkOS enforcement is enabled.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getPathMock } = vi.hoisted(() => ({
  getPathMock: vi.fn<(name: string) => string>()
}))

vi.mock('electron', () => ({
  app: { getPath: getPathMock }
}))

import { _internals } from './hook-service'

type GateHooks = {
  'tool.execute.before': (
    input: { tool: string },
    output: { args: Record<string, unknown> }
  ) => Promise<void>
}

const ENFORCED_ENV = {
  ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '1',
  ORCA_PANE_KEY: 'tab-1:leaf-1',
  ORCA_AGENT_HOOK_PORT: '45678',
  ORCA_AGENT_HOOK_TOKEN: 'test-token'
} as const

describe('OpenCode plugin side-effect gate', () => {
  let tempDir: string
  let savedEnv: Record<string, string | undefined>
  let savedFetch: typeof globalThis.fetch

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'orca-opencode-side-effect-plugin-'))
    savedEnv = {}
    for (const key of [
      ...Object.keys(ENFORCED_ENV),
      'ORCA_AGENT_LAUNCH_TOKEN',
      'ORCA_TAB_ID',
      'ORCA_WORKTREE_ID',
      'ORCA_AGENT_HOOK_ENDPOINT'
    ]) {
      savedEnv[key] = process.env[key]
    }
    for (const [key, value] of Object.entries(ENFORCED_ENV)) {
      process.env[key] = value
    }
    process.env.ORCA_AGENT_LAUNCH_TOKEN = 'launch-token-1'
    process.env.ORCA_TAB_ID = 'tab-1'
    process.env.ORCA_WORKTREE_ID = 'worktree-1'
    delete process.env.ORCA_AGENT_HOOK_ENDPOINT
    savedFetch = globalThis.fetch
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.fetch = savedFetch
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    rmSync(tempDir, { recursive: true, force: true })
  })

  async function loadGate(): Promise<GateHooks> {
    const pluginPath = join(tempDir, `orca-opencode-status-${Date.now()}-${Math.random()}.mjs`)
    writeFileSync(pluginPath, _internals.getOpenCodePluginSource())
    const module = (await import(pathToFileURL(pluginPath).href)) as {
      OrcaOpenCodeStatusPlugin: (ctx: unknown) => Promise<Record<string, unknown>>
    }
    const hooks = await module.OrcaOpenCodeStatusPlugin(undefined)
    return hooks as unknown as GateHooks
  }

  function respondWith(status: number, body: string): void {
    globalThis.fetch = vi.fn(async () => new Response(body, { status })) as typeof globalThis.fetch
  }

  it('allows the tool through without contacting Orca when enforcement is off', async () => {
    let fetchCalled = false
    globalThis.fetch = vi.fn(async () => {
      fetchCalled = true
      return new Response(null, { status: 204 })
    }) as typeof globalThis.fetch
    process.env.ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT = undefined

    const gate = await loadGate()
    await expect(
      gate['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git push' } })
    ).resolves.toBeUndefined()

    expect(fetchCalled).toBe(false)
  })

  it('blocks a denied side effect with the approval reason', async () => {
    respondWith(
      200,
      JSON.stringify({
        hookSpecificOutput: {
          permissionDecision: 'deny',
          permissionDecisionReason: 'Blocked by policy.'
        }
      })
    )
    const gate = await loadGate()
    await expect(
      gate['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git push' } })
    ).rejects.toThrow('Blocked by policy.')
  })

  it('falls back to the transport denial message when a deny carries no reason', async () => {
    respondWith(200, JSON.stringify({ hookSpecificOutput: { permissionDecision: 'deny' } }))
    const gate = await loadGate()
    await expect(gate['tool.execute.before']({ tool: 'bash' }, { args: {} })).rejects.toThrow(
      'BarkOS approval service is unavailable; the side effect was blocked.'
    )
  })

  it('allows an approved side effect and posts the full PreToolUse envelope', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return new Response('{}', { status: 200 })
    }) as typeof globalThis.fetch
    const gate = await loadGate()
    await expect(
      gate['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git push' } })
    ).resolves.toBeUndefined()

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('http://127.0.0.1:45678/hook/opencode')
    const headers = new Headers(calls[0]!.init?.headers)
    expect(headers.get('X-Orca-Agent-Hook-Token')).toBe('test-token')
    const envelope = JSON.parse(String(calls[0]!.init?.body))
    expect(envelope).toMatchObject({
      paneKey: 'tab-1:leaf-1',
      launchToken: 'launch-token-1',
      tabId: 'tab-1',
      worktreeId: 'worktree-1',
      barkosSideEffectEnforcement: '1',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'bash',
        tool_input: { command: 'git push' }
      }
    })
  })

  it.each([
    ['a non-2xx response', async () => new Response('nope', { status: 503 })],
    ['an empty enforced body', async () => new Response(null, { status: 200 })],
    ['an unparseable enforced body', async () => new Response('<html>', { status: 200 })],
    [
      'a rejected request',
      async () => {
        throw new Error('ECONNREFUSED')
      }
    ]
  ])('fails closed on %s', async (_label, respond) => {
    globalThis.fetch = vi.fn(respond) as typeof globalThis.fetch
    const gate = await loadGate()
    await expect(gate['tool.execute.before']({ tool: 'bash' }, { args: {} })).rejects.toThrow(
      'BarkOS approval service is unavailable; the side effect was blocked.'
    )
  })

  it('fails closed without a request when hook coordinates are missing', async () => {
    let fetchCalled = false
    globalThis.fetch = vi.fn(async () => {
      fetchCalled = true
      return new Response('{}', { status: 200 })
    }) as typeof globalThis.fetch
    delete process.env.ORCA_PANE_KEY

    const gate = await loadGate()
    await expect(gate['tool.execute.before']({ tool: 'bash' }, { args: {} })).rejects.toThrow(
      'BarkOS approval service is unavailable; the side effect was blocked.'
    )
    expect(fetchCalled).toBe(false)
  })

  it('aborts a stalled approval round trip after the gate timeout', async () => {
    vi.useFakeTimers()
    globalThis.fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal
      if (!signal) {
        return Promise.reject(new Error('missing abort signal'))
      }
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
    }) as typeof globalThis.fetch
    const gate = await loadGate()
    const pending = gate['tool.execute.before']({ tool: 'bash' }, { args: {} })
    const assertion = expect(pending).rejects.toThrow(
      'BarkOS approval service is unavailable; the side effect was blocked.'
    )
    await vi.advanceTimersByTimeAsync(8_000)
    await assertion
  })
})
