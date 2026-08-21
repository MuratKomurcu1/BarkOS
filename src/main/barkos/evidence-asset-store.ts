import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  type PathLike
} from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import {
  BARKOS_EVIDENCE_SCREENSHOT_MAX_BYTES,
  type BarkosEvidenceScreenshotSelection
} from '../../shared/barkos/evidence-screenshot'
import { assertRasterImagePreviewWithinLimits } from '../../shared/raster-image-preview-limits'

const BARKOS_EVIDENCE_ASSET_PATH = join('barkos', 'evidence-assets')
const BARKOS_EVIDENCE_PATH_LIMIT = 2_048
const SCREENSHOT_MIME_TYPES: Readonly<Record<string, string>> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function assertExistingAssetMatches(assetPath: PathLike, digest: string): void {
  if (!lstatSync(assetPath).isFile()) {
    throw new Error('BarkOS evidence asset target must be a regular file')
  }
  if (sha256(readFileSync(assetPath)) !== digest) {
    throw new Error('BarkOS evidence asset hash collision')
  }
}

export class BarkosEvidenceAssetStore {
  private readonly assetDirectory: string

  constructor(userDataPath: string) {
    this.assetDirectory = join(userDataPath, BARKOS_EVIDENCE_ASSET_PATH)
  }

  importScreenshot(sourcePath: string): BarkosEvidenceScreenshotSelection {
    const resolvedSourcePath = resolve(sourcePath)
    const extension = extname(resolvedSourcePath).toLowerCase()
    const mimeType = SCREENSHOT_MIME_TYPES[extension]
    if (!mimeType) {
      throw new Error('BarkOS evidence screenshots must be PNG, JPEG, GIF, or WebP files')
    }
    const stats = statSync(resolvedSourcePath)
    if (!stats.isFile() || stats.size <= 0) {
      throw new Error('BarkOS evidence screenshot must be a non-empty file')
    }
    if (stats.size > BARKOS_EVIDENCE_SCREENSHOT_MAX_BYTES) {
      throw new Error('BarkOS evidence screenshot exceeds the 8 MB limit')
    }
    const contents = readFileSync(resolvedSourcePath)
    if (contents.byteLength !== stats.size) {
      throw new Error('BarkOS evidence screenshot changed while it was being read')
    }
    assertRasterImagePreviewWithinLimits(contents, mimeType)

    const digest = sha256(contents)
    mkdirSync(this.assetDirectory, { recursive: true, mode: 0o700 })
    if (process.platform !== 'win32') {
      chmodSync(this.assetDirectory, 0o700)
    }
    const assetPath = join(
      this.assetDirectory,
      `${digest}${extension === '.jpeg' ? '.jpg' : extension}`
    )
    if (assetPath.length > BARKOS_EVIDENCE_PATH_LIMIT) {
      throw new Error('BarkOS evidence asset path exceeds the storage limit')
    }
    if (existsSync(assetPath)) {
      assertExistingAssetMatches(assetPath, digest)
    } else {
      try {
        writeFileSync(assetPath, contents, { flag: 'wx', mode: 0o600 })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error
        }
        assertExistingAssetMatches(assetPath, digest)
      }
    }
    return {
      path: assetPath,
      fileName: basename(resolvedSourcePath).slice(0, 255),
      bytes: contents.byteLength,
      sha256: digest
    }
  }
}
