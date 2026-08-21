import { afterEach, describe, expect, it, vi } from 'vitest'
import { installApi } from './web-preload-api-test-harness'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('web BarkOS usage-cost preload API', () => {
  it('does not relabel desktop-host usage as web-client accounting', async () => {
    const { api } = await installApi('Linux')

    expect(await api.barkosUsageCost.load()).toBeNull()
    await expect(api.barkosUsageCost.sync({ candidates: [] })).rejects.toThrow(
      'available on the desktop host'
    )
  })
})
