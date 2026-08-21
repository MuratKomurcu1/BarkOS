import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBarkosCompany } from '../../shared/barkos/company'
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

import { registerBarkosWorkerSessionHandlers } from './barkos-worker-sessions'

let userDataPath: string
const event = { sender: { id: 1 } }

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'barkos-worker-session-ipc-'))
  mocks.handlers.clear()
  mocks.getPath.mockReturnValue(userDataPath)
  mocks.isTrustedUIRenderer.mockReturnValue(true)
  registerBarkosWorkerSessionHandlers()
})

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true })
})

describe('BarkOS worker session IPC', () => {
  it('records and reloads a binding scoped to the active company', () => {
    const company = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Ship reliable work.',
      leadName: 'Ada',
      now: 1
    })
    new BarkosCompanyStore(userDataPath).save(company)
    const load = mocks.handlers.get('barkosWorkerSessions:load')
    const record = mocks.handlers.get('barkosWorkerSessions:record')

    expect(load?.(event)).toBeNull()
    const snapshot = record?.(event, {
      workerId: company.leadWorkerId,
      agent: 'codex',
      targetId: '5:localworkspace-main',
      workspaceId: 'workspace-main',
      workspaceKind: 'worktree',
      executionHostId: 'local',
      tabId: 'tab-1',
      state: 'created',
      launchedAt: 2
    })
    expect(snapshot).toMatchObject({ companyId: company.id, revision: 1 })
    expect(load?.(event)).toEqual(snapshot)
  })

  it('rejects untrusted renderers and recording without a company', () => {
    const load = mocks.handlers.get('barkosWorkerSessions:load')
    const record = mocks.handlers.get('barkosWorkerSessions:record')

    expect(() => record?.(event, {})).toThrow('barkos_company_not_found')
    mocks.isTrustedUIRenderer.mockReturnValue(false)
    expect(() => load?.(event)).toThrow('unauthorized_barkos_worker_session_sender')
  })
})
