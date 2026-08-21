import { afterEach, describe, expect, it, vi } from 'vitest'
import { installApi } from './web-preload-api-test-harness'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('web BarkOS test-evidence preload API', () => {
  it('fails closed instead of executing a desktop worker command in the web client', async () => {
    const { api } = await installApi('Linux')

    await expect(
      api.barkosWorkLedger.runTest({
        version: 1,
        dispatchId: 'dispatch-1',
        command: 'pnpm test'
      })
    ).rejects.toThrow('available in the desktop app')
    await expect(api.barkosWorkLedger.cancelTest('dispatch-1')).resolves.toBe(false)
  })
})
