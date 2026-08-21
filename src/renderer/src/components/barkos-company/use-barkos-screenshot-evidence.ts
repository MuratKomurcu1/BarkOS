import { useCallback, useRef, useState } from 'react'
import {
  BARKOS_EVIDENCE_SCREENSHOT_UI_LIMIT,
  type BarkosEvidenceScreenshotSelection
} from '../../../../shared/barkos/evidence-screenshot'
import { translate } from '@/i18n/i18n'

export type BarkosScreenshotEvidenceDraft = BarkosEvidenceScreenshotSelection & {
  caption: string
}

export type BarkosScreenshotEvidenceController = {
  screenshots: BarkosScreenshotEvidenceDraft[]
  picking: boolean
  error: string | null
  complete: boolean
  atLimit: boolean
  pick: () => Promise<void>
  updateCaption: (sha256: string, caption: string) => void
  remove: (sha256: string) => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useBarkosScreenshotEvidence(disabled: boolean): BarkosScreenshotEvidenceController {
  const [screenshots, setScreenshots] = useState<BarkosScreenshotEvidenceDraft[]>([])
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pickingRef = useRef(false)
  const atLimit = screenshots.length >= BARKOS_EVIDENCE_SCREENSHOT_UI_LIMIT

  const pick = useCallback(async (): Promise<void> => {
    if (disabled || pickingRef.current || atLimit) {
      return
    }
    pickingRef.current = true
    setPicking(true)
    setError(null)
    try {
      const selection = await window.api.barkosWorkLedger.pickScreenshot()
      if (!selection) {
        return
      }
      if (screenshots.some((screenshot) => screenshot.sha256 === selection.sha256)) {
        setError(
          translate('barkos.evidence.screenshot.duplicate', 'This screenshot is already attached.')
        )
        return
      }
      setScreenshots((current) => [
        ...current,
        { ...selection, caption: selection.fileName.slice(0, 1_000) }
      ])
    } catch (caught) {
      setError(
        translate(
          'barkos.evidence.screenshot.attachFailed',
          'Screenshot could not be attached: {{value0}}',
          { value0: errorMessage(caught) }
        )
      )
    } finally {
      pickingRef.current = false
      setPicking(false)
    }
  }, [atLimit, disabled, screenshots])

  const updateCaption = useCallback((sha256: string, caption: string): void => {
    setScreenshots((current) =>
      current.map((screenshot) =>
        screenshot.sha256 === sha256 ? { ...screenshot, caption } : screenshot
      )
    )
  }, [])

  const remove = useCallback((sha256: string): void => {
    setScreenshots((current) => current.filter((screenshot) => screenshot.sha256 !== sha256))
    setError(null)
  }, [])

  return {
    screenshots,
    picking,
    error,
    complete: screenshots.every((screenshot) => screenshot.caption.trim() !== ''),
    atLimit,
    pick,
    updateCaption,
    remove
  }
}
