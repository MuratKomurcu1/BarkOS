import { create } from 'zustand'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBarkosCompany } from '../../../../shared/barkos/company'
import {
  createEmptyBarkosDecisionInbox,
  type BarkosDecisionInbox
} from '../../../../shared/barkos/decision-inbox'
import type { AppState } from '../types'
import { createBarkosCompanySlice } from './barkos-company'
import { createBarkosDecisionInboxSlice } from './barkos-decision-inbox'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship reliable work.',
  leadName: 'Ada',
  now: 1
})
const inboxLoad = vi.fn()
const inboxSave = vi.fn()

function createTestStore() {
  return create<AppState>()(
    (...args) =>
      ({
        ...createBarkosCompanySlice(...args),
        ...createBarkosDecisionInboxSlice(...args)
      }) as unknown as AppState
  )
}

beforeEach(() => {
  inboxLoad.mockReset()
  inboxSave.mockReset()
  vi.stubGlobal('window', {
    api: {
      barkosDecisionInbox: { load: inboxLoad, save: inboxSave }
    }
  })
})

describe('BarkOS decision inbox slice', () => {
  it('loads the company-scoped decision audit', async () => {
    const inbox = createEmptyBarkosDecisionInbox(company.id, company.createdAt, 2)
    inboxLoad.mockResolvedValue(inbox)
    const store = createTestStore()
    store.setState({ barkosCompany: company, barkosCompanyLoadState: 'ready' })

    await store.getState().loadBarkosDecisionInbox(company.id)

    expect(store.getState()).toMatchObject({
      barkosDecisionInbox: inbox,
      barkosDecisionInboxLoadState: 'ready',
      barkosDecisionInboxRequestedCompanyId: company.id,
      barkosDecisionInboxError: null
    })
  })

  it('creates revision zero and re-reads when another client wins the race', async () => {
    const raced = createEmptyBarkosDecisionInbox(company.id, company.createdAt, 2)
    inboxLoad.mockResolvedValueOnce(null).mockResolvedValueOnce(raced)
    inboxSave.mockRejectedValue(new Error('revision-conflict'))
    const store = createTestStore()
    store.setState({ barkosCompany: company, barkosCompanyLoadState: 'ready' })

    await store.getState().loadBarkosDecisionInbox(company.id)

    expect(inboxSave).toHaveBeenCalledWith(expect.objectContaining({ revision: 0 }))
    expect(store.getState()).toMatchObject({
      barkosDecisionInbox: raced,
      barkosDecisionInboxLoadState: 'ready'
    })
  })

  it('publishes save errors without replacing the durable snapshot', async () => {
    const inbox = createEmptyBarkosDecisionInbox(company.id, company.createdAt, 2)
    const next = { ...inbox, revision: 1, updatedAt: 3 } as BarkosDecisionInbox
    inboxSave.mockRejectedValue(new Error('disk-full'))
    const store = createTestStore()
    store.setState({
      barkosCompany: company,
      barkosCompanyLoadState: 'ready',
      barkosDecisionInbox: inbox,
      barkosDecisionInboxLoadState: 'ready'
    })

    await expect(store.getState().saveBarkosDecisionInbox(next)).rejects.toThrow('disk-full')

    expect(store.getState()).toMatchObject({
      barkosDecisionInbox: inbox,
      barkosDecisionInboxLoadState: 'error',
      barkosDecisionInboxError: 'disk-full'
    })
  })
})
