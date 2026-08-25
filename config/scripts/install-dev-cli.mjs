#!/usr/bin/env node
// Symlinks the barkos-dev wrapper into /usr/local/bin so the dev CLI is
// available globally after `pnpm run build:cli`.
import { existsSync, lstatSync, readlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const scriptDir = import.meta.dirname
const source = path.join(scriptDir, 'barkos-dev.mjs')

if (process.env.ORCA_SKIP_DEV_CLI_INSTALL === '1') {
  console.log('[barkos-dev] Skipping global dev CLI install during packaging.')
  process.exit(0)
}

const commandPath =
  process.platform === 'darwin' || process.platform === 'linux' ? '/usr/local/bin/barkos-dev' : null

if (!commandPath) {
  console.log('[barkos-dev] Skipping global symlink (unsupported platform).')
  process.exit(0)
}

function isOwnedByUs(target) {
  try {
    if (!lstatSync(target).isSymbolicLink()) {
      return false
    }
    return readlinkSync(target) === source
  } catch {
    return false
  }
}

if (existsSync(commandPath)) {
  if (isOwnedByUs(commandPath)) {
    console.log(`[barkos-dev] ${commandPath} already points to dev CLI.`)
    process.exit(0)
  }
  console.error(
    `[barkos-dev] ${commandPath} exists but is not our symlink. Remove it manually if you want the dev CLI installed globally.`
  )
  process.exit(0)
}

try {
  execFileSync('ln', ['-s', source, commandPath], { stdio: 'inherit' })
  console.log(`[barkos-dev] Symlinked ${commandPath} → ${source}`)
} catch {
  console.log(
    `[barkos-dev] Could not create ${commandPath} (permission denied). Run once with:\n` +
      `  sudo ln -s ${source} ${commandPath}`
  )
}
