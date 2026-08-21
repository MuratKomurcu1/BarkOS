export const BARKOS_EVIDENCE_SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024
export const BARKOS_EVIDENCE_SCREENSHOT_UI_LIMIT = 5

export type BarkosEvidenceScreenshotSelection = {
  path: string
  fileName: string
  bytes: number
  sha256: string
}
