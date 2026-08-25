import { describe, expect, it } from 'vitest'
import type { BarkosLiveOfficeWorker } from '@/lib/barkos-live-office'
import {
  barkosPixelOfficePalette,
  barkosPixelSpriteFrame,
  createBarkosPixelOfficeAvatar,
  syncBarkosPixelOfficeAvatars,
  updateBarkosPixelOfficeAvatar
} from './barkos-pixel-office-engine'
import {
  barkosPixelOfficeBlockedTiles,
  findBarkosPixelOfficePath
} from './barkos-pixel-office-layout'

function worker(overrides: Partial<BarkosLiveOfficeWorker> = {}): BarkosLiveOfficeWorker {
  return {
    workerId: 'worker-1',
    status: 'working',
    work: [],
    workspaceId: 'workspace-1',
    executionHostId: 'local',
    toolName: null,
    toolInput: null,
    activityUpdatedAt: null,
    station: 'implementation',
    ...overrides
  }
}

describe('BarkOS piksel ofis motoru', () => {
  it('çalışan ajanı girişten masasına yürütür', () => {
    const entry = worker()
    const avatar = createBarkosPixelOfficeAvatar(entry, 0)
    const startY = avatar.y

    updateBarkosPixelOfficeAvatar({ avatar, worker: entry, dt: 0.5, motionEnabled: true })

    expect(avatar.mode).toBe('walk')
    expect(avatar.y).toBeLessThan(startY)
    expect(avatar.targetX).toBe(avatar.seat.x)
  })

  it('dosya arayan ajanı okuma animasyonuna geçirir', () => {
    const entry = worker({ toolName: 'ReadFile', station: 'analysis' })
    const avatar = createBarkosPixelOfficeAvatar(entry, 0)

    updateBarkosPixelOfficeAvatar({ avatar, worker: entry, dt: 0.3, motionEnabled: false })

    expect(avatar.mode).toBe('read')
    expect(barkosPixelSpriteFrame(avatar).column).toBeGreaterThanOrEqual(5)
  })

  it('gerçek araç olayında ajanı ilgili ofis istasyonuna yollar', () => {
    const entry = worker({ toolName: 'runTests', station: 'verification' })
    const avatar = createBarkosPixelOfficeAvatar(entry, 0)

    updateBarkosPixelOfficeAvatar({ avatar, worker: entry, dt: 0.1, motionEnabled: true })

    expect(avatar.mode).toBe('walk')
    expect(avatar.targetCol).toBeGreaterThan(24)
    expect(avatar.targetRow).toBe(3)
  })

  it('boştaki ajan için ofis içinde yeni bir gezinme hedefi seçer', () => {
    const entry = worker({ status: 'idle' })
    const avatar = createBarkosPixelOfficeAvatar(entry, 0)
    avatar.wanderElapsed = 0

    updateBarkosPixelOfficeAvatar({ avatar, worker: entry, dt: 0.1, motionEnabled: true })

    expect(avatar.mode).toBe('walk')
    expect(avatar.path.length).toBeGreaterThan(0)
    expect([avatar.targetCol, avatar.targetRow]).not.toEqual([avatar.seat.col, avatar.seat.row])
  })

  it('mobilyaların içinden geçmek yerine karo rotası oluşturur', () => {
    const blocked = barkosPixelOfficeBlockedTiles()
    const path = findBarkosPixelOfficePath({ col: 4, row: 14 }, { col: 4, row: 7 }, blocked)

    expect(path.length).toBeGreaterThan(7)
    expect(path.every((tile) => !blocked.has(`${tile.col},${tile.row}`))).toBe(true)
  })

  it('çalışanın karakter paletini sıralamadan bağımsız sabit tutar', () => {
    expect(barkosPixelOfficePalette('worker-1', 6)).toBe(barkosPixelOfficePalette('worker-1', 6))
    expect(barkosPixelOfficePalette('worker-1', 6)).toBeLessThan(6)
  })

  it('eklenen ve çıkarılan çalışanları aynı canlı sahneye eşler', () => {
    const avatars = new Map()
    const first = worker()
    const second = worker({ workerId: 'worker-2' })

    syncBarkosPixelOfficeAvatars({ avatars, workers: [first, second] })
    expect([...avatars.keys()]).toEqual(['worker-1', 'worker-2'])

    syncBarkosPixelOfficeAvatars({ avatars, workers: [second] })
    expect([...avatars.keys()]).toEqual(['worker-2'])
  })
})
