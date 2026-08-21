import { describe, expect, it } from 'vitest'
import {
  BARKOS_LIVE_OFFICE_VIEW_PREFERENCES_KEY,
  DEFAULT_BARKOS_LIVE_OFFICE_VIEW_PREFERENCES,
  readBarkosLiveOfficeViewPreferences,
  writeBarkosLiveOfficeViewPreferences
} from './barkos-live-office-view-preferences'

function memoryStorage(initial: string | null = null): Pick<Storage, 'getItem' | 'setItem'> {
  let value = initial
  return {
    getItem: (key) => (key === BARKOS_LIVE_OFFICE_VIEW_PREFERENCES_KEY ? value : null),
    setItem: (key, next) => {
      if (key === BARKOS_LIVE_OFFICE_VIEW_PREFERENCES_KEY) {
        value = next
      }
    }
  }
}

describe('BarkOS Live Office view preferences', () => {
  it('fails closed to system motion and comfortable density', () => {
    const malformed = memoryStorage('{"schemaVersion":2,"density":"compact","motion":"off"}')

    expect(readBarkosLiveOfficeViewPreferences(malformed)).toEqual(
      DEFAULT_BARKOS_LIVE_OFFICE_VIEW_PREFERENCES
    )
  })

  it('round-trips the strict client-local preference', () => {
    const storage = memoryStorage()
    writeBarkosLiveOfficeViewPreferences(
      { schemaVersion: 1, density: 'compact', motion: 'off' },
      storage
    )

    expect(readBarkosLiveOfficeViewPreferences(storage)).toEqual({
      schemaVersion: 1,
      density: 'compact',
      motion: 'off'
    })
  })
})
