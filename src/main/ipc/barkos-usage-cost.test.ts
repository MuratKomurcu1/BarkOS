import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPath: vi.fn(() => '/user-data'),
  handle: vi.fn(),
  companyLoad: vi.fn(),
  workLedgerLoad: vi.fn(),
  costLoad: vi.fn(),
  costSave: vi.fn(),
  collect: vi.fn(),
  collectRemote: vi.fn(),
  trusted: vi.fn(() => true)
}))

vi.mock('electron', () => ({ app: { getPath: mocks.getPath }, ipcMain: { handle: mocks.handle } }))
vi.mock('../barkos/company-store', () => ({
  BarkosCompanyStore: class {
    load = mocks.companyLoad
  }
}))
vi.mock('../barkos/work-ledger-store', () => ({
  BarkosWorkLedgerStore: class {
    load = mocks.workLedgerLoad
  }
}))
vi.mock('../barkos/usage-cost-store', () => ({
  BarkosUsageCostStore: class {
    load = mocks.costLoad
    save = mocks.costSave
  }
}))
vi.mock('../barkos/usage-cost-collector', () => ({ collectBarkosUsageCosts: mocks.collect }))
vi.mock('../barkos/remote-usage-cost-client', () => ({
  collectBarkosPairedRemoteUsageCosts: mocks.collectRemote
}))
vi.mock('./ui', () => ({ isTrustedUIRenderer: mocks.trusted }))

import { registerBarkosUsageCostHandlers } from './barkos-usage-cost'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.trusted.mockReturnValue(true)
  mocks.collectRemote.mockResolvedValue(new Map())
})

describe('BarkOS usage-cost IPC', () => {
  it('validates and collects against main-owned company and work ledgers', async () => {
    const company = { id: 'barkos-labs', createdAt: 1 }
    const workLedger = { companyId: 'barkos-labs' }
    const collected = { companyId: 'barkos-labs', revision: 1 }
    const claudeUsage = { provider: 'claude' }
    const codexUsage = { provider: 'codex' }
    mocks.companyLoad.mockReturnValue(company)
    mocks.workLedgerLoad.mockReturnValue(workLedger)
    mocks.costLoad.mockReturnValue(null)
    mocks.collect.mockResolvedValue(collected)
    mocks.costSave.mockReturnValue(collected)
    registerBarkosUsageCostHandlers({ claudeUsage, codexUsage } as never)
    const sync = mocks.handle.mock.calls.find(
      ([channel]) => channel === 'barkosUsageCost:sync'
    )?.[1]

    await expect(
      sync(
        { sender: {} },
        {
          candidates: [
            {
              dispatchId: 'dispatch-one',
              orchestrationDispatchId: 'runtime-one',
              providerSessionId: 'session-one'
            }
          ]
        }
      )
    ).resolves.toEqual(collected)
    expect(mocks.collect).toHaveBeenCalledWith(
      expect.objectContaining({
        company,
        workLedger,
        claudeUsage,
        codexUsage,
        remoteRecords: expect.any(Map)
      })
    )
    expect(mocks.collectRemote).toHaveBeenCalledWith(
      expect.objectContaining({ userDataPath: '/user-data', company, workLedger })
    )
    expect(mocks.costSave).toHaveBeenCalledWith(collected, company)
  })

  it('rejects duplicate candidates before reading company data', async () => {
    registerBarkosUsageCostHandlers({ claudeUsage: {}, codexUsage: {} } as never)
    const sync = mocks.handle.mock.calls.find(
      ([channel]) => channel === 'barkosUsageCost:sync'
    )?.[1]
    const candidate = {
      dispatchId: 'dispatch-one',
      orchestrationDispatchId: null,
      providerSessionId: null
    }

    await expect(sync({ sender: {} }, { candidates: [candidate, candidate] })).rejects.toThrow(
      'Duplicate usage-cost candidate'
    )
    expect(mocks.companyLoad).not.toHaveBeenCalled()
  })

  it('rejects untrusted renderers before touching stores', () => {
    mocks.trusted.mockReturnValue(false)
    registerBarkosUsageCostHandlers({ claudeUsage: {}, codexUsage: {} } as never)
    const load = mocks.handle.mock.calls.find(
      ([channel]) => channel === 'barkosUsageCost:load'
    )?.[1]

    expect(() => load({ sender: {} })).toThrow('unauthorized_barkos_usage_cost_sender')
    expect(mocks.companyLoad).not.toHaveBeenCalled()
  })
})
