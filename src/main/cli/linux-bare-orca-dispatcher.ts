import { existsSync } from 'node:fs'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { buildAppImageCliWrapper, quoteShell } from './appimage-cli-wrapper'
import { BARKOS_CLI_COMMAND_NAME } from './bundled-cli-launcher-path'
import { getBundledLauncherPath } from './cli-installer'

const DISPATCHER_MARKER = '# barkos-serve-bare-barkos-dispatcher'

export type LinuxBareBarkosDispatcherOptions = {
  /** Packaged app resources root; the bundled BarkOS launcher lives under it. */
  resourcesPath: string
  /** Test seam — defaults to the real home directory. */
  homePath?: string
  /** Test seam — defaults to $APPIMAGE (set only when running from an AppImage). */
  appImagePath?: string | null
}

export type LinuxBareBarkosDispatcherState =
  | 'installed'
  | 'skipped-foreign'
  | 'skipped-launcher-missing'

export type LinuxBareBarkosDispatcherResult = {
  state: LinuxBareBarkosDispatcherState
  dispatcherPath: string
  /** What the dispatcher execs: the stable AppImage, or the bundled BarkOS launcher. */
  target: string | null
}

// Why: serve needs a non-privileged fallback when global CLI installation is
// unavailable, but BarkOS must never own or replace GNOME/Orca's `orca` command.
export async function installLinuxBareBarkosDispatcher(
  options: LinuxBareBarkosDispatcherOptions
): Promise<LinuxBareBarkosDispatcherResult> {
  const dispatcherPath = join(
    options.homePath ?? homedir(),
    '.local',
    'bin',
    BARKOS_CLI_COMMAND_NAME
  )
  const appImagePath = options.appImagePath ?? process.env.APPIMAGE ?? null

  const resolved = resolveDispatcherScript(options.resourcesPath, appImagePath)
  if (!resolved) {
    return { state: 'skipped-launcher-missing', dispatcherPath, target: null }
  }

  // Why: only (re)write a dispatcher we previously created; leave a user's own
  // `barkos` untouched rather than silently clobbering it on every serve start.
  if (existsSync(dispatcherPath) && !(await isOwnedDispatcher(dispatcherPath))) {
    return { state: 'skipped-foreign', dispatcherPath, target: resolved.target }
  }

  await mkdir(dirname(dispatcherPath), { recursive: true })
  await writeFile(dispatcherPath, resolved.script, 'utf8')
  await chmod(dispatcherPath, 0o755)
  return { state: 'installed', dispatcherPath, target: resolved.target }
}

/** Bare-`barkos` script that execs the BarkOS CLI: the stable AppImage when running
 *  from one, otherwise the bundled launcher. Shared by the serve
 *  dispatcher and the managed-terminal PATH shim. */
export function buildBareBarkosCliScript(
  resourcesPath: string,
  appImagePath: string | null
): { script: string; target: string } | null {
  if (appImagePath) {
    // Why: an AppImage mounts resources under an ephemeral FUSE path per launch,
    // so the script must exec the stable outer AppImage — reuse the same
    // wrapper CliInstaller installs for the AppImage command.
    return { script: buildAppImageCliWrapper(appImagePath), target: appImagePath }
  }

  const launcher = getBundledLauncherPath('linux', resourcesPath)
  // Why: getBundledLauncherPath only joins the path; guard existence so we never
  // write a script pointing at a missing launcher (which would fail at exec
  // time with a confusing error instead of the command-not-found we fix).
  if (!launcher || !existsSync(launcher)) {
    return null
  }
  return {
    script: `#!/usr/bin/env bash\nexec ${quoteShell(launcher)} "$@"\n`,
    target: launcher
  }
}

function resolveDispatcherScript(
  resourcesPath: string,
  appImagePath: string | null
): { script: string; target: string } | null {
  const resolved = buildBareBarkosCliScript(resourcesPath, appImagePath)
  return resolved && { script: withMarker(resolved.script), target: resolved.target }
}

function withMarker(script: string): string {
  const firstNewline = script.indexOf('\n')
  if (firstNewline === -1) {
    return `${script}\n${DISPATCHER_MARKER}\n`
  }
  // Keep the shebang on line 1; insert the marker immediately after it.
  return `${script.slice(0, firstNewline + 1)}${DISPATCHER_MARKER}\n${script.slice(firstNewline + 1)}`
}

async function isOwnedDispatcher(dispatcherPath: string): Promise<boolean> {
  try {
    return (await readFile(dispatcherPath, 'utf8')).includes(DISPATCHER_MARKER)
  } catch {
    return false
  }
}
