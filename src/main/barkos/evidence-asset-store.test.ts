import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BarkosEvidenceAssetStore } from './evidence-asset-store'

function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes)
  bytes.writeUInt32BE(13, 8)
  bytes.write('IHDR', 12, 'ascii')
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

let userDataPath: string

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'barkos-evidence-assets-'))
})

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true })
})

describe('BarkosEvidenceAssetStore', () => {
  it('validates and imports a screenshot into a content-addressed private asset', () => {
    const source = join(userDataPath, 'Release Screenshot.PNG')
    const contents = pngHeader(1_920, 1_080)
    writeFileSync(source, contents)
    const digest = createHash('sha256').update(contents).digest('hex')
    const store = new BarkosEvidenceAssetStore(userDataPath)

    const first = store.importScreenshot(source)
    const second = store.importScreenshot(source)

    expect(first).toEqual({
      path: join(userDataPath, 'barkos', 'evidence-assets', `${digest}.png`),
      fileName: 'Release Screenshot.PNG',
      bytes: contents.byteLength,
      sha256: digest
    })
    expect(second).toEqual(first)
    expect(readFileSync(first.path)).toEqual(contents)
    if (process.platform !== 'win32') {
      expect(statSync(join(userDataPath, 'barkos', 'evidence-assets')).mode & 0o777).toBe(0o700)
      expect(statSync(first.path).mode & 0o777).toBe(0o600)
    }
  })

  it('rejects unsupported and unsafe raster files', () => {
    const store = new BarkosEvidenceAssetStore(userDataPath)
    const unsupported = join(userDataPath, 'screen.svg')
    const oversizedDimensions = join(userDataPath, 'screen.png')
    writeFileSync(unsupported, '<svg/>')
    writeFileSync(oversizedDimensions, pngHeader(40_000, 1))

    expect(() => store.importScreenshot(unsupported)).toThrow('PNG, JPEG, GIF, or WebP')
    expect(() => store.importScreenshot(oversizedDimensions)).toThrow(
      'Image dimensions exceed the preview safety limit'
    )
  })
})
