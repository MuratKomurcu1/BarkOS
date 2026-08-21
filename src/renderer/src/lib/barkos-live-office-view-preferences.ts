import { z } from 'zod'

export const BARKOS_LIVE_OFFICE_VIEW_PREFERENCES_KEY = 'barkos.live-office.view-preferences.v1'

const barkosLiveOfficeViewPreferencesSchema = z
  .object({
    schemaVersion: z.literal(1),
    density: z.enum(['comfortable', 'compact']),
    motion: z.enum(['system', 'off'])
  })
  .strict()

export type BarkosLiveOfficeViewPreferences = z.infer<typeof barkosLiveOfficeViewPreferencesSchema>

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

export const DEFAULT_BARKOS_LIVE_OFFICE_VIEW_PREFERENCES = Object.freeze({
  schemaVersion: 1,
  density: 'comfortable',
  motion: 'system'
}) satisfies BarkosLiveOfficeViewPreferences

function browserStorage(): PreferenceStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readBarkosLiveOfficeViewPreferences(
  storage: PreferenceStorage | null = browserStorage()
): BarkosLiveOfficeViewPreferences {
  if (!storage) {
    return DEFAULT_BARKOS_LIVE_OFFICE_VIEW_PREFERENCES
  }
  try {
    const value = storage.getItem(BARKOS_LIVE_OFFICE_VIEW_PREFERENCES_KEY)
    if (!value) {
      return DEFAULT_BARKOS_LIVE_OFFICE_VIEW_PREFERENCES
    }
    const parsed = barkosLiveOfficeViewPreferencesSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : DEFAULT_BARKOS_LIVE_OFFICE_VIEW_PREFERENCES
  } catch {
    return DEFAULT_BARKOS_LIVE_OFFICE_VIEW_PREFERENCES
  }
}

export function writeBarkosLiveOfficeViewPreferences(
  preferences: BarkosLiveOfficeViewPreferences,
  storage: PreferenceStorage | null = browserStorage()
): void {
  if (!storage) {
    return
  }
  try {
    storage.setItem(
      BARKOS_LIVE_OFFICE_VIEW_PREFERENCES_KEY,
      JSON.stringify(barkosLiveOfficeViewPreferencesSchema.parse(preferences))
    )
  } catch {
    // A blocked preference store must not make the read-only office unusable.
  }
}
