import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPath: vi.fn(() => '/user-data'),
  handle: vi.fn(),
  companyLoad: vi.fn(),
  policyLoad: vi.fn(),
  policySave: vi.fn(),
  trusted: vi.fn(() => true)
}))

vi.mock('electron', () => ({ app: { getPath: mocks.getPath }, ipcMain: { handle: mocks.handle } }))
vi.mock('../barkos/company-store', () => ({
  BarkosCompanyStore: class {
    load = mocks.companyLoad
  }
}))
vi.mock('../barkos/control-policy-store', () => ({
  BarkosControlPolicyStore: class {
    load = mocks.policyLoad
    save = mocks.policySave
  }
}))
vi.mock('./ui', () => ({ isTrustedUIRenderer: mocks.trusted }))

import { registerBarkosControlPolicyHandlers } from './barkos-control-policy'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.companyLoad.mockReturnValue(null)
  mocks.trusted.mockReturnValue(true)
})

describe('BarkOS control policy IPC', () => {
  it('loads and saves against the active company', () => {
    const company = { id: 'company' }
    mocks.companyLoad.mockReturnValue(company)
    registerBarkosControlPolicyHandlers()
    const handlers = new Map(
      mocks.handle.mock.calls.map(([channel, handler]) => [channel, handler])
    )
    handlers.get('barkosControlPolicy:load')?.({ sender: {} })
    handlers.get('barkosControlPolicy:save')?.({ sender: {} }, { revision: 1 })
    expect(mocks.policyLoad).toHaveBeenCalledWith(company)
    expect(mocks.policySave).toHaveBeenCalledWith({ revision: 1 }, company)
  })

  it('returns null without a company and rejects untrusted renderers', () => {
    registerBarkosControlPolicyHandlers()
    const handlers = new Map(
      mocks.handle.mock.calls.map(([channel, handler]) => [channel, handler])
    )
    expect(handlers.get('barkosControlPolicy:load')?.({ sender: {} })).toBeNull()
    expect(() => handlers.get('barkosControlPolicy:save')?.({ sender: {} }, {})).toThrow(
      'barkos_company_not_found'
    )

    mocks.trusted.mockReturnValue(false)
    expect(() => handlers.get('barkosControlPolicy:load')?.({ sender: {} })).toThrow(
      'unauthorized_barkos_control_policy_sender'
    )
  })
})
