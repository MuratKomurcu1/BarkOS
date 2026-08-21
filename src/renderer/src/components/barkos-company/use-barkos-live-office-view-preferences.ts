import { useCallback, useRef, useState } from 'react'
import {
  readBarkosLiveOfficeViewPreferences,
  writeBarkosLiveOfficeViewPreferences,
  type BarkosLiveOfficeViewPreferences
} from '@/lib/barkos-live-office-view-preferences'

export type BarkosLiveOfficeViewPreferencesController = BarkosLiveOfficeViewPreferences & {
  setDensity: (density: BarkosLiveOfficeViewPreferences['density']) => void
  setMotion: (motion: BarkosLiveOfficeViewPreferences['motion']) => void
}

export function useBarkosLiveOfficeViewPreferences(): BarkosLiveOfficeViewPreferencesController {
  const [preferences, setPreferences] = useState(readBarkosLiveOfficeViewPreferences)
  const current = useRef(preferences)
  const update = useCallback((updates: Partial<BarkosLiveOfficeViewPreferences>): void => {
    const next = { ...current.current, ...updates }
    current.current = next
    setPreferences(next)
    writeBarkosLiveOfficeViewPreferences(next)
  }, [])
  const setDensity = useCallback(
    (density: BarkosLiveOfficeViewPreferences['density']) => update({ density }),
    [update]
  )
  const setMotion = useCallback(
    (motion: BarkosLiveOfficeViewPreferences['motion']) => update({ motion }),
    [update]
  )
  return { ...preferences, setDensity, setMotion }
}
