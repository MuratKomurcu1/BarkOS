import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBarkosCompany } from '../../shared/barkos/company'
import { createEmptyBarkosDecisionInbox } from '../../shared/barkos/decision-inbox'
import { BarkosCompanyStore } from '../barkos/company-store'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  getPath: vi.fn(),
  isTrustedUIRenderer: vi.fn(() => true)
}))

vi.mock('electron', () => ({
  app: { getPath: mocks.getPath },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      mocks.handlers.set(channel, handler)
    })
  }
}))

vi.mock('./ui', () => ({ isTrustedUIRenderer: mocks.isTrustedUIRenderer }))

import { registerBarkosDecisionInboxHandlers } from './barkos-decision-inbox'

let userDataPath: string
const event = { sender: { id: 1 } }

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'barkos-decision-inbox-ipc-'))
  mocks.handlers.clear()
  mocks.getPath.mockReturnValue(userDataPath)
  mocks.isTrustedUIRenderer.mockReturnValue(true)
  registerBarkosDecisionInboxHandlers({} as never)
})

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true })
})

describe('BarkOS decision inbox IPC', () => {
  it('loads and saves only the active company generation', () => {
    const company = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Ship reliable work.',
      leadName: 'Ada',
      now: 1
    })
    new BarkosCompanyStore(userDataPath).save(company)
    const inbox = createEmptyBarkosDecisionInbox(company.id, company.createdAt, 2)

    expect(mocks.handlers.get('barkosDecisionInbox:load')?.(event)).toBeNull()
    expect(mocks.handlers.get('barkosDecisionInbox:save')?.(event, inbox)).toEqual(inbox)
    expect(mocks.handlers.get('barkosDecisionInbox:load')?.(event)).toEqual(inbox)
  })

  it('rejects missing company state and untrusted renderers', () => {
    expect(() =>
      mocks.handlers.get('barkosDecisionInbox:save')?.(
        event,
        createEmptyBarkosDecisionInbox('barkos-labs', 1, 2)
      )
    ).toThrow('barkos_company_not_found')
    mocks.isTrustedUIRenderer.mockReturnValue(false)
    expect(() => mocks.handlers.get('barkosDecisionInbox:load')?.(event)).toThrow(
      'unauthorized_barkos_decision_inbox_sender'
    )
  })
})
