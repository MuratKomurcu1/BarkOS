import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getGeminiManagedHookScript } from './managed-hook-script'

const roots: string[] = []
const payload = JSON.stringify({
  hook_event_name: 'BeforeTool',
  tool_name: 'run_shell_command',
  tool_input: { command: 'git push origin main' }
})

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function cleanEnvironment(extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ORCA_'))),
    ORCA_AGENT_HOOK_ENDPOINT: '',
    ...extra
  }
}

function writeScript(): string {
  const root = mkdtempSync(join(tmpdir(), 'orca-gemini-managed-hook-'))
  roots.push(root)
  const scriptPath = join(root, 'gemini-hook.sh')
  writeFileSync(scriptPath, getGeminiManagedHookScript('posix'), { mode: 0o700 })
  return scriptPath
}

describe.skipIf(process.platform === 'win32')('Gemini managed hook script', () => {
  it('fails closed on transport loss only for an enforced BeforeTool event', () => {
    const scriptPath = writeScript()
    const baseEnv = {
      ORCA_AGENT_HOOK_PORT: '1',
      ORCA_AGENT_HOOK_TOKEN: 'token',
      ORCA_PANE_KEY: 'tab-1:11111111-1111-4111-8111-111111111111'
    }
    const normal = spawnSync('/bin/sh', [scriptPath], {
      env: cleanEnvironment({ ...baseEnv, ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '0' }),
      input: payload,
      encoding: 'utf8'
    })
    const enforced = spawnSync('/bin/sh', [scriptPath], {
      env: cleanEnvironment({ ...baseEnv, ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '1' }),
      input: payload,
      encoding: 'utf8'
    })
    const enforcedAfterTool = spawnSync('/bin/sh', [scriptPath], {
      env: cleanEnvironment({ ...baseEnv, ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '1' }),
      input: JSON.stringify({ hook_event_name: 'AfterTool' }),
      encoding: 'utf8'
    })

    expect(normal.status).toBe(0)
    expect(JSON.parse(normal.stdout.trim())).toEqual({})
    expect(enforced.status).toBe(0)
    expect(JSON.parse(enforced.stdout.trim())).toEqual({
      decision: 'deny',
      reason: 'BarkOS approval service is unavailable; the side effect was blocked.'
    })
    expect(enforcedAfterTool.status).toBe(0)
    expect(JSON.parse(enforcedAfterTool.stdout.trim())).toEqual({})
  })

  it('forwards the exact Gemini decision and enforcement marker', async () => {
    const scriptPath = writeScript()
    let postedBody = ''
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        postedBody = Buffer.concat(chunks).toString('utf8')
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ decision: 'deny', reason: 'Approval required.' }))
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port

    try {
      const child = spawn('/bin/sh', [scriptPath], {
        env: cleanEnvironment({
          ORCA_AGENT_HOOK_PORT: String(port),
          ORCA_AGENT_HOOK_TOKEN: 'token',
          ORCA_PANE_KEY: 'tab-1:11111111-1111-4111-8111-111111111111',
          ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '1'
        }),
        stdio: ['pipe', 'pipe', 'pipe']
      })
      let stdout = ''
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
      })
      child.stdin.end(payload)
      const exitCode = await new Promise<number | null>((resolve) => child.on('close', resolve))

      expect(exitCode).toBe(0)
      expect(JSON.parse(stdout.trim())).toEqual({
        decision: 'deny',
        reason: 'Approval required.'
      })
      const form = new URLSearchParams(postedBody)
      expect(form.get('barkosSideEffectEnforcement')).toBe('1')
      expect(JSON.parse(form.get('payload') ?? '{}')).toMatchObject({
        hook_event_name: 'BeforeTool',
        tool_name: 'run_shell_command'
      })
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})

describe('Gemini managed Windows hook script', () => {
  it('keeps enforcement metadata and structured transport denial in the batch lane', () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
    try {
      const script = getGeminiManagedHookScript()
      expect(script).toContain('--fail')
      expect(script).toContain(
        '--data-urlencode "barkosSideEffectEnforcement=%ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT%"'
      )
      expect(script).toContain('"decision":"deny"')
    } finally {
      if (original) {
        Object.defineProperty(process, 'platform', original)
      }
    }
  })
})
