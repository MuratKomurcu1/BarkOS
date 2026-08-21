import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'

const projectDir = dirname(dirname(import.meta.dirname))
const resourcesDir = join(projectDir, 'resources')
const buildDir = join(resourcesDir, 'build')

function readPng(relativePath) {
  return PNG.sync.read(readFileSync(join(resourcesDir, relativePath)))
}

describe('BarkOS app icon assets', () => {
  it('keeps a high-resolution transparent canonical source', () => {
    const source = readPng('icon-source/barkos-master.png')
    expect(source.width).toBe(source.height)
    expect(source.width).toBeGreaterThanOrEqual(1024)
    expect(source.data[3]).toBe(0)

    const centerAlpha = source.data[((source.height / 2) * source.width + source.width / 2) * 4 + 3]
    expect(centerAlpha).toBeGreaterThan(250)
  })

  it('ships the expected desktop PNG sizes', () => {
    const packageIcon = readPng('build/icon.png')
    const runtimeIcon = readPng('icon.png')

    expect([packageIcon.width, packageIcon.height]).toEqual([1024, 1024])
    expect([runtimeIcon.width, runtimeIcon.height]).toEqual([256, 256])
  })

  it('ships native macOS/Linux and Windows icon containers', () => {
    const icns = readFileSync(join(buildDir, 'icon.icns'))
    const ico = readFileSync(join(buildDir, 'icon.ico'))

    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns')
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(6)
  })

  it('regenerates every platform icon from the BarkOS master', () => {
    const generateScript = readFileSync(join(resourcesDir, 'icon-source', 'generate.sh'), 'utf8')
    expect(generateScript).toContain('barkos-master.png')
    expect(generateScript).not.toContain('ICON_SOURCE="$SCRIPT_DIR/icon.icon"')
  })
})
