import { describe, expect, it } from 'vitest'
import { activeHostCodexAccountId } from './barkos-codex-account-mutation'

describe('BarkOS desktop Codex account selection', () => {
  it('uses the host lane instead of a legacy or WSL selection', () => {
    expect(
      activeHostCodexAccountId({
        accounts: [],
        activeAccountId: 'legacy-account',
        activeAccountIdsByRuntime: {
          host: 'host-account',
          wsl: { Ubuntu: 'wsl-account' }
        }
      })
    ).toBe('host-account')
  })

  it('supports legacy responses and the system-default account', () => {
    expect(activeHostCodexAccountId({ accounts: [], activeAccountId: 'legacy-account' })).toBe(
      'legacy-account'
    )
    expect(
      activeHostCodexAccountId({
        accounts: [],
        activeAccountId: 'legacy-account',
        activeAccountIdsByRuntime: { host: null, wsl: {} }
      })
    ).toBeNull()
  })
})
