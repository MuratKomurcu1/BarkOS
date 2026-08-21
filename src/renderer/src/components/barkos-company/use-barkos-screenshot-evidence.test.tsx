// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useBarkosScreenshotEvidence,
  type BarkosScreenshotEvidenceController
} from './use-barkos-screenshot-evidence'

const pickScreenshot = vi.fn()
let originalApiDescriptor: PropertyDescriptor | undefined
let root: Root | null = null
let controller: BarkosScreenshotEvidenceController | null = null

function Probe(): React.JSX.Element | null {
  controller = useBarkosScreenshotEvidence(false)
  return null
}

beforeEach(() => {
  originalApiDescriptor = Object.getOwnPropertyDescriptor(window, 'api')
  pickScreenshot.mockReset().mockResolvedValue({
    path: '/managed/evidence/abc.png',
    fileName: 'release.png',
    bytes: 2_048,
    sha256: 'a'.repeat(64)
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      barkosWorkLedger: { pickScreenshot }
    } as unknown as Window['api']
  })
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  controller = null
  document.body.innerHTML = ''
  if (originalApiDescriptor) {
    Object.defineProperty(window, 'api', originalApiDescriptor)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})

describe('useBarkosScreenshotEvidence', () => {
  it('attaches a user-selected managed image and keeps its caption explicit', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root?.render(<Probe />))

    await act(async () => controller?.pick())

    expect(controller?.screenshots).toEqual([
      expect.objectContaining({ fileName: 'release.png', caption: 'release.png' })
    ])
    expect(controller?.complete).toBe(true)
    await act(async () => controller?.updateCaption('a'.repeat(64), 'Verified release screen'))
    expect(controller?.screenshots[0]?.caption).toBe('Verified release screen')
  })

  it('rejects duplicate content-addressed screenshots', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root?.render(<Probe />))

    await act(async () => controller?.pick())
    await act(async () => controller?.pick())

    expect(controller?.screenshots).toHaveLength(1)
    expect(controller?.error).toBe('This screenshot is already attached.')
  })
})
