import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPath: vi.fn(() => '/user-data'),
  handle: vi.fn(),
  companyLoad: vi.fn(),
  capacityLoad: vi.fn(),
  capacitySave: vi.fn(),
  trusted: vi.fn(() => true)
}))

vi.mock('electron', () => ({ app: { getPath: mocks.getPath }, ipcMain: { handle: mocks.handle } }))
vi.mock('../barkos/company-store', () => ({
  BarkosCompanyStore: class {
    load = mocks.companyLoad
  }
}))
vi.mock('../barkos/provider-capacity-store', () => ({
  BarkosProviderCapacityStore: class {
    load = mocks.capacityLoad
    save = mocks.capacitySave
  }
}))
vi.mock('./ui', () => ({ isTrustedUIRenderer: mocks.trusted }))

import { registerBarkosProviderCapacityHandlers } from './barkos-provider-capacity'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.trusted.mockReturnValue(true)
})

describe('BarkOS provider capacity IPC', () => {
  it('loads and saves against the active company', () => {
    const company = { id: 'company' }
    mocks.companyLoad.mockReturnValue(company)
    registerBarkosProviderCapacityHandlers()
    const handlers = new Map(
      mocks.handle.mock.calls.map(([channel, handler]) => [channel, handler])
    )
    handlers.get('barkosProviderCapacity:load')?.({ sender: {} })
    handlers.get('barkosProviderCapacity:save')?.({ sender: {} }, { revision: 1 })
    expect(mocks.capacityLoad).toHaveBeenCalledWith(company)
    expect(mocks.capacitySave).toHaveBeenCalledWith({ revision: 1 }, company)
  })

  it('rejects untrusted renderers before touching stores', () => {
    mocks.trusted.mockReturnValue(false)
    registerBarkosProviderCapacityHandlers()
    const load = mocks.handle.mock.calls.find(
      ([channel]) => channel === 'barkosProviderCapacity:load'
    )?.[1]
    expect(() => load({ sender: {} })).toThrow('unauthorized_barkos_provider_capacity_sender')
    expect(mocks.companyLoad).not.toHaveBeenCalled()
  })
})
