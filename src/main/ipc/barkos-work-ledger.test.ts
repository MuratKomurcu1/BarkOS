import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BarkosCompanyStore } from '../barkos/company-store'
import { createBarkosCompany } from '../../shared/barkos/company'
import { createEmptyBarkosWorkLedger } from '../../shared/barkos/work-ledger'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  getPath: vi.fn(),
  isTrustedUIRenderer: vi.fn(() => true),
  showOpenDialog: vi.fn(),
  fromWebContents: vi.fn(() => null),
  runTestEvidence: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: mocks.getPath },
  BrowserWindow: { fromWebContents: mocks.fromWebContents },
  dialog: { showOpenDialog: mocks.showOpenDialog },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      mocks.handlers.set(channel, handler)
    })
  }
}))

vi.mock('./ui', () => ({ isTrustedUIRenderer: mocks.isTrustedUIRenderer }))
vi.mock('../barkos/test-evidence-runner', () => ({
  runBarkosTestEvidence: mocks.runTestEvidence
}))

import { registerBarkosWorkLedgerHandlers } from './barkos-work-ledger'

let userDataPath: string
const sender = Object.assign(new EventEmitter(), { id: 1 })
const event = { sender }

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'barkos-work-ledger-ipc-'))
  mocks.handlers.clear()
  mocks.getPath.mockReturnValue(userDataPath)
  mocks.isTrustedUIRenderer.mockReturnValue(true)
  mocks.showOpenDialog.mockReset().mockResolvedValue({ canceled: true, filePaths: [] })
  mocks.fromWebContents.mockReset().mockReturnValue(null)
  mocks.runTestEvidence.mockReset().mockResolvedValue({
    version: 1,
    command: 'pnpm test',
    status: 'passed',
    summary: 'Exited with code 0.',
    durationMs: 10
  })
  registerBarkosWorkLedgerHandlers({} as never)
})

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true })
})

describe('BarkOS work-ledger IPC', () => {
  it('returns null while no company is active', () => {
    expect(mocks.handlers.get('barkosWorkLedger:load')?.(event)).toBeNull()
    expect(() =>
      mocks.handlers.get('barkosWorkLedger:save')?.(
        event,
        createEmptyBarkosWorkLedger('barkos-labs', 1)
      )
    ).toThrow('barkos_company_not_found')
  })

  it('loads and saves a company-scoped validated ledger', () => {
    const company = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Ship dependable systems.',
      leadName: 'Ada',
      now: 1
    })
    const ledger = createEmptyBarkosWorkLedger(company.id, 2)
    new BarkosCompanyStore(userDataPath).save(company)

    expect(mocks.handlers.get('barkosWorkLedger:load')?.(event)).toBeNull()
    expect(mocks.handlers.get('barkosWorkLedger:save')?.(event, ledger)).toEqual(ledger)
    expect(mocks.handlers.get('barkosWorkLedger:load')?.(event)).toEqual(ledger)
  })

  it('rejects foreign company state and untrusted renderers', () => {
    const company = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Ship dependable systems.',
      leadName: 'Ada',
      now: 1
    })
    new BarkosCompanyStore(userDataPath).save(company)
    const save = mocks.handlers.get('barkosWorkLedger:save')

    expect(() => save?.(event, createEmptyBarkosWorkLedger('other-company', 2))).toThrow()
    mocks.isTrustedUIRenderer.mockReturnValue(false)
    expect(() => save?.(event, createEmptyBarkosWorkLedger(company.id, 2))).toThrow(
      'unauthorized_barkos_work_ledger_sender'
    )
  })

  it('imports an explicitly selected validated screenshot into managed evidence storage', async () => {
    const company = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Ship dependable systems.',
      leadName: 'Ada',
      now: 1
    })
    new BarkosCompanyStore(userDataPath).save(company)
    const screenshotPath = join(userDataPath, 'release.png')
    const screenshot = Buffer.alloc(24)
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(screenshot)
    screenshot.writeUInt32BE(13, 8)
    screenshot.write('IHDR', 12, 'ascii')
    screenshot.writeUInt32BE(1_920, 16)
    screenshot.writeUInt32BE(1_080, 20)
    writeFileSync(screenshotPath, screenshot)
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [screenshotPath] })

    const result = await mocks.handlers.get('barkosWorkLedger:pickScreenshot')?.(event)

    expect(result).toMatchObject({
      fileName: 'release.png',
      bytes: screenshot.byteLength,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    })
    expect(mocks.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ properties: ['openFile'] })
    )
  })

  it('runs and cancels an exact dispatch test through its renderer-owned controller', async () => {
    let signal: AbortSignal | null = null
    mocks.runTestEvidence.mockImplementationOnce(
      (_deps: unknown, _request: unknown, activeSignal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal = activeSignal
          activeSignal.addEventListener(
            'abort',
            () => reject(new Error('barkos_test_run_cancelled')),
            { once: true }
          )
        })
    )
    const run = mocks.handlers.get('barkosWorkLedger:runTest')
    const pending = Promise.resolve(
      run?.(event, { version: 1, dispatchId: 'dispatch-1', command: 'pnpm test' })
    )

    await vi.waitFor(() => expect(signal).not.toBeNull())
    expect(mocks.runTestEvidence).toHaveBeenCalledWith(
      expect.any(Object),
      { version: 1, dispatchId: 'dispatch-1', command: 'pnpm test' },
      expect.any(AbortSignal)
    )
    expect(mocks.handlers.get('barkosWorkLedger:cancelTest')?.(event, 'dispatch-1')).toBe(true)
    expect(mocks.handlers.get('barkosWorkLedger:cancelTest')?.(event, '../dispatch-1')).toBe(false)
    await expect(pending).rejects.toThrow('barkos_test_run_cancelled')
    expect((signal ?? new AbortController().signal).aborted).toBe(true)
  })

  it('rejects test execution from an untrusted renderer', async () => {
    mocks.isTrustedUIRenderer.mockReturnValue(false)

    await expect(
      mocks.handlers.get('barkosWorkLedger:runTest')?.(event, {
        version: 1,
        dispatchId: 'dispatch-1',
        command: 'pnpm test'
      })
    ).rejects.toThrow('unauthorized_barkos_work_ledger_sender')
    expect(mocks.runTestEvidence).not.toHaveBeenCalled()
  })
})
