import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPath: vi.fn(() => '/user-data'),
  handle: vi.fn(),
  companyLoad: vi.fn(),
  vaultLoad: vi.fn(),
  vaultSave: vi.fn(),
  trusted: vi.fn(() => true)
}))

vi.mock('electron', () => ({ app: { getPath: mocks.getPath }, ipcMain: { handle: mocks.handle } }))
vi.mock('../barkos/company-store', () => ({
  BarkosCompanyStore: class {
    load = mocks.companyLoad
  }
}))
vi.mock('../barkos/memory-vault-store', () => ({
  BarkosMemoryVaultStore: class {
    load = mocks.vaultLoad
    save = mocks.vaultSave
  }
}))
vi.mock('./ui', () => ({ isTrustedUIRenderer: mocks.trusted }))

import { registerBarkosMemoryVaultHandlers } from './barkos-memory-vault'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.trusted.mockReturnValue(true)
})

describe('BarkOS memory vault IPC', () => {
  it('loads and saves against the active company', () => {
    const company = { id: 'company' }
    mocks.companyLoad.mockReturnValue(company)
    registerBarkosMemoryVaultHandlers()
    const handlers = new Map(
      mocks.handle.mock.calls.map(([channel, handler]) => [channel, handler])
    )
    handlers.get('barkosMemoryVault:load')?.({ sender: {} })
    handlers.get('barkosMemoryVault:save')?.({ sender: {} }, { revision: 1 })
    expect(mocks.vaultLoad).toHaveBeenCalledWith(company)
    expect(mocks.vaultSave).toHaveBeenCalledWith({ revision: 1 }, company)
  })

  it('rejects untrusted renderers before touching stores', () => {
    mocks.trusted.mockReturnValue(false)
    registerBarkosMemoryVaultHandlers()
    const load = mocks.handle.mock.calls.find(
      ([channel]) => channel === 'barkosMemoryVault:load'
    )?.[1]
    expect(() => load({ sender: {} })).toThrow('unauthorized_barkos_memory_vault_sender')
    expect(mocks.companyLoad).not.toHaveBeenCalled()
  })
})
