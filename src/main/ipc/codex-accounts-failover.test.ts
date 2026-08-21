import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  prepare: vi.fn(),
  trusted: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      mocks.handlers.set(channel, handler)
    })
  }
}))
vi.mock('./ui', () => ({ isTrustedUIRenderer: mocks.trusted }))
vi.mock('../codex/codex-pane-account-registry', () => ({
  listRecordedCodexPaneLanes: vi.fn(() => ({}))
}))
vi.mock('../codex/codex-stale-pane-accounts', () => ({
  forgetStaleCodexPanes: vi.fn(),
  listStaleCodexPanes: vi.fn(() => [])
}))

import type { CodexAccountService } from '../codex-accounts/service'
import { registerCodexAccountHandlers } from './codex-accounts'

beforeEach(() => {
  mocks.handlers.clear()
  mocks.prepare.mockReset().mockResolvedValue({ key: 'session_id', id: 'session-1' })
  mocks.trusted.mockReset().mockReturnValue(true)
  registerCodexAccountHandlers({
    prepareSelectedHostAccountFailoverResume: mocks.prepare
  } as unknown as CodexAccountService)
})

describe('Codex account failover IPC', () => {
  it('passes a validated managed account and provider session to the service', async () => {
    const handler = mocks.handlers.get('codexAccounts:prepareFailoverResume')
    const providerSession = {
      key: 'session_id',
      id: 'session-1',
      transcriptPath: '/managed/a/sessions/2026/08/18/rollout-session-1.jsonl'
    }

    await expect(
      handler?.({ sender: { id: 1 } }, { accountId: 'account-b', providerSession })
    ).resolves.toEqual({ key: 'session_id', id: 'session-1' })
    expect(mocks.prepare).toHaveBeenCalledWith('account-b', providerSession)
  })

  it('rejects untrusted renderers before touching account state', () => {
    mocks.trusted.mockReturnValue(false)
    const handler = mocks.handlers.get('codexAccounts:prepareFailoverResume')

    expect(() => handler?.({ sender: { id: 2 } }, { accountId: 'account-b' })).toThrow(
      'unauthorized_barkos_codex_failover_sender'
    )
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
})
