import { beforeEach, describe, expect, it, vi } from 'vitest'
import { commandExecFileAsync } from '../git/runner'
import {
  buildBarkosTestEvidenceResult,
  runBarkosLocalTestEvidenceCommand
} from './test-evidence-command-executor'

vi.mock('../git/runner', () => ({ commandExecFileAsync: vi.fn() }))

const plan = { command: 'pnpm test', binary: 'pnpm', args: ['test'] }

describe('BarkOS test evidence command executor', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses fixed argv, bounded output, timeout, prompt guards, and the caller signal', async () => {
    vi.mocked(commandExecFileAsync).mockResolvedValue({ stdout: 'ok', stderr: '' })
    const signal = new AbortController().signal

    await expect(
      runBarkosLocalTestEvidenceCommand(plan, '/workspace/repo', signal)
    ).resolves.toEqual({ stdout: 'ok', stderr: '', exitCode: 0, timedOut: false })
    expect(commandExecFileAsync).toHaveBeenCalledWith('pnpm', ['test'], {
      cwd: '/workspace/repo',
      encoding: 'utf-8',
      env: expect.objectContaining({ GIT_TERMINAL_PROMPT: '0' }),
      maxBuffer: 64 * 1_024,
      timeout: 5 * 60 * 1_000,
      signal
    })
  })

  it('returns only redacted bounded evidence output', () => {
    const result = buildBarkosTestEvidenceResult(
      plan,
      {
        stdout: `${'x'.repeat(2_000)}\nTOKEN=secret-value`,
        stderr: '',
        exitCode: 0,
        timedOut: false
      },
      Date.now()
    )

    expect(result.summary.length).toBeLessThanOrEqual(1_000)
    expect(result.summary).toContain('[redacted:labeled-kv]')
    expect(result.summary).not.toContain('secret-value')
  })
})
