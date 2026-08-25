import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: true }
}))

import { ensureLinuxTerminalBarkosCliShimDir } from './linux-terminal-barkos-cli-shim'

const created: string[] = []

async function makeFixture(): Promise<{ userDataPath: string; resourcesPath: string }> {
  const root = await mkdtemp(join(tmpdir(), 'orca-terminal-cli-shim-'))
  created.push(root)
  const resourcesPath = join(root, 'resources')
  // The bundled BarkOS launcher must exist for the shim to be written.
  mkdirSync(join(resourcesPath, 'bin'), { recursive: true })
  writeFileSync(join(resourcesPath, 'bin', 'barkos'), '#!/usr/bin/env bash\n', 'utf8')
  return { userDataPath: join(root, 'user-data'), resourcesPath }
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('ensureLinuxTerminalBarkosCliShimDir', () => {
  it('writes an executable barkos shim that execs the bundled launcher', async () => {
    const { userDataPath, resourcesPath } = await makeFixture()

    const shimDir = ensureLinuxTerminalBarkosCliShimDir({
      userDataPath,
      resourcesPath,
      appImagePath: null
    })

    expect(shimDir).toBe(join(userDataPath, 'linux-barkos-cli-shim'))
    const content = readFileSync(join(shimDir!, 'barkos'), 'utf8')
    // Single-quoted so a resources path with shell metacharacters can't break out.
    expect(content).toContain(`exec '${join(resourcesPath, 'bin', 'barkos')}' "$@"`)
    const mode = statSync(join(shimDir!, 'barkos')).mode & 0o777
    expect(mode & 0o111).not.toBe(0)
  })

  it('memoizes per userDataPath and re-asserts the exec bit for a stale shim', async () => {
    const { userDataPath, resourcesPath } = await makeFixture()
    const options = { userDataPath, resourcesPath, appImagePath: null }

    const first = ensureLinuxTerminalBarkosCliShimDir(options)
    expect(first).not.toBeNull()
    const shimPath = join(first!, 'barkos')
    chmodSync(shimPath, 0o644)

    // A distinct userData path is not memoized, so ensure runs again and heals
    // the exec bit lost above only when it actually processes that path.
    const second = ensureLinuxTerminalBarkosCliShimDir(options)
    expect(second).toBe(first)

    const root = await mkdtemp(join(tmpdir(), 'orca-terminal-cli-shim-2-'))
    created.push(root)
    const otherUserData = join(root, 'user-data')
    mkdirSync(join(otherUserData, 'linux-barkos-cli-shim'), { recursive: true })
    writeFileSync(join(otherUserData, 'linux-barkos-cli-shim', 'barkos'), 'stale contents', 'utf8')
    chmodSync(join(otherUserData, 'linux-barkos-cli-shim', 'barkos'), 0o644)

    const healed = ensureLinuxTerminalBarkosCliShimDir({
      userDataPath: otherUserData,
      resourcesPath,
      appImagePath: null
    })
    expect(healed).not.toBeNull()
    const healedPath = join(healed!, 'barkos')
    expect(readFileSync(healedPath, 'utf8')).toContain('barkos')
    expect(statSync(healedPath).mode & 0o111).not.toBe(0)
  })

  it('execs the stable AppImage (not the ephemeral mount) when running from an AppImage', async () => {
    const { userDataPath, resourcesPath } = await makeFixture()
    const appImagePath = join(userDataPath, 'Applications', 'BarkOS.AppImage')

    const shimDir = ensureLinuxTerminalBarkosCliShimDir({
      userDataPath,
      resourcesPath,
      appImagePath
    })

    const content = readFileSync(join(shimDir!, 'barkos'), 'utf8')
    expect(content).toContain(appImagePath)
    expect(content).not.toContain(resourcesPath)
  })

  it('returns null (and does not memoize) when the bundled launcher is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-terminal-cli-shim-missing-'))
    created.push(root)
    const userDataPath = join(root, 'user-data')

    const missing = ensureLinuxTerminalBarkosCliShimDir({
      userDataPath,
      resourcesPath: join(root, 'resources'),
      appImagePath: null
    })
    expect(missing).toBeNull()

    // Once the launcher exists (e.g. later probe with real resources), the same
    // userData path succeeds — proving failures are not cached.
    const resourcesPath = join(root, 'resources')
    mkdirSync(join(resourcesPath, 'bin'), { recursive: true })
    writeFileSync(join(resourcesPath, 'bin', 'barkos'), '#!/usr/bin/env bash\n', 'utf8')
    const recovered = ensureLinuxTerminalBarkosCliShimDir({
      userDataPath,
      resourcesPath,
      appImagePath: null
    })
    expect(recovered).toBe(join(userDataPath, 'linux-barkos-cli-shim'))
  })
})
