import { describe, expect, it, vi } from 'vitest'
import { acquireBarkosProjectWorkspace } from './barkos-project-workspace-acquisition'

describe('BarkOS proje çalışma alanı edinimi', () => {
  it('mevcut hedef varsa klasör seçiciyi açmaz', async () => {
    const pickFolder = vi.fn()
    const result = await acquireBarkosProjectWorkspace({
      currentTarget: { id: 'hazır' },
      pickFolder,
      addFolder: vi.fn(),
      resolveTarget: vi.fn()
    })

    expect(result).toEqual({ state: 'ready', target: { id: 'hazır' } })
    expect(pickFolder).not.toHaveBeenCalled()
  })

  it('hedef yoksa klasörü ekleyip yeni ajan hedefini çözer', async () => {
    const addFolder = vi.fn().mockResolvedValue({ id: 'repo' })
    const result = await acquireBarkosProjectWorkspace({
      currentTarget: null,
      pickFolder: vi.fn().mockResolvedValue('/projeler/barkos'),
      addFolder,
      resolveTarget: vi.fn().mockReturnValue({ id: 'workspace' })
    })

    expect(addFolder).toHaveBeenCalledWith('/projeler/barkos')
    expect(result).toEqual({ state: 'ready', target: { id: 'workspace' } })
  })

  it('klasör seçimi iptal edilince çalışma başlatmaz', async () => {
    const addFolder = vi.fn()
    const result = await acquireBarkosProjectWorkspace({
      currentTarget: null,
      pickFolder: vi.fn().mockResolvedValue(null),
      addFolder,
      resolveTarget: vi.fn()
    })

    expect(result).toEqual({ state: 'cancelled' })
    expect(addFolder).not.toHaveBeenCalled()
  })
})
