import type { CliInstallStatus } from '../../shared/cli-install-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execFileMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  execFile: execFileMock
}))

import { WslCliInstaller, _internals } from './wsl-cli-installer'

const COMMAND_PATH = '/home/alice/.local/bin/barkos'
const BRIDGE_PATH = '/home/alice/.local/share/barkos/barkos-wsl-bridge.ps1'
const WINDOWS_LAUNCHER =
  'C:\\Users\\me\\AppData\\Local\\Programs\\BarkOS\\resources\\bin\\barkos.exe'

function makeHostStatus(launcherPath = WINDOWS_LAUNCHER): CliInstallStatus {
  return {
    platform: 'win32',
    commandName: 'barkos',
    commandPath: launcherPath,
    pathDirectory: 'C:\\Users\\me\\AppData\\Local\\Programs\\BarkOS\\resources\\bin',
    pathConfigured: true,
    launcherPath,
    installMethod: 'wrapper',
    supported: true,
    state: 'installed',
    currentTarget: launcherPath,
    unsupportedReason: null,
    detail: null
  }
}

function createWslRunner(
  options: {
    command?: string | null
    bridge?: string | null
    pathConfigured?: boolean
    interopReady?: boolean
    failInstall?: boolean
  } = {}
) {
  let commandFile = options.command ?? null
  let bridgeFile =
    options.bridge === undefined && commandFile
      ? _internals.buildWslBridgeScript()
      : (options.bridge ?? null)
  const calls: string[] = []
  const runner = vi.fn(async (_distro: string, command: string) => {
    calls.push(command)
    if (command.includes('printf %s "$HOME"')) {
      return '/home/alice'
    }
    if (command.includes('case ":$PATH:"')) {
      return options.pathConfigured === false ? 'no' : 'yes'
    }
    if (command.includes('cat > "$command_tmp"')) {
      if (options.failInstall) {
        throw new Error('simulated replacement failure')
      }
      if (bridgeFile && !bridgeFile.includes('# Orca managed WSL CLI PowerShell bridge')) {
        throw new Error('__ORCA_CONFLICT__')
      }
      commandFile =
        command.match(/cat > "\$command_tmp" <<'ORCA_WSL_CLI'\n([\s\S]*)\nORCA_WSL_CLI/)?.[1] ?? ''
      bridgeFile =
        command.match(
          /cat > "\$bridge_tmp" <<'ORCA_WSL_BRIDGE'\n([\s\S]*)\nORCA_WSL_BRIDGE/
        )?.[1] ?? ''
      return ''
    }
    if (command.includes('command -v powershell.exe')) {
      return options.interopReady === false ? 'no' : 'yes'
    }
    if (command.includes('rm -f')) {
      if (bridgeFile && !bridgeFile.includes('# Orca managed WSL CLI PowerShell bridge')) {
        throw new Error('__ORCA_CONFLICT__')
      }
      commandFile = null
      bridgeFile = null
      return ''
    }
    if (command.includes(COMMAND_PATH)) {
      return commandFile ?? '__ORCA_MISSING__'
    }
    if (command.includes(BRIDGE_PATH)) {
      return bridgeFile ?? '__ORCA_MISSING__'
    }
    throw new Error(`Unexpected WSL command: ${command}`)
  })
  return {
    runner,
    calls,
    getCommand: () => commandFile,
    getBridge: () => bridgeFile
  }
}

describe('WslCliInstaller', () => {
  beforeEach(() => {
    execFileMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('installs an isolated BarkOS WSL command and bridge', async () => {
    const wsl = createWslRunner()
    const installer = new WslCliInstaller({
      platform: 'win32',
      distro: 'Ubuntu',
      hostInstaller: { getStatus: async () => makeHostStatus() },
      wslRunner: wsl.runner
    })

    await expect(installer.getStatus()).resolves.toMatchObject({
      state: 'not_installed',
      commandName: 'barkos',
      commandPath: COMMAND_PATH
    })
    await expect(installer.install()).resolves.toMatchObject({
      state: 'installed',
      launcherPath: WINDOWS_LAUNCHER
    })
    expect(wsl.getCommand()).toBe(_internals.buildWslLauncher(WINDOWS_LAUNCHER, BRIDGE_PATH))
    expect(wsl.getBridge()).toBe(_internals.buildWslBridgeScript())
    expect(wsl.calls.join('\n')).not.toContain("/home/alice/.local/bin/orca'")
  })

  it('keeps WSL available when the host PATH registry read is unknown', async () => {
    const wsl = createWslRunner()
    const installer = new WslCliInstaller({
      platform: 'win32',
      distro: 'Ubuntu',
      hostInstaller: {
        getStatus: async () => ({
          ...makeHostStatus(),
          pathConfigured: null,
          detail: 'BarkOS could not read the Windows user PATH registry value.'
        })
      },
      wslRunner: wsl.runner
    })

    await expect(installer.getStatus()).resolves.toMatchObject({
      supported: true,
      state: 'not_installed'
    })
  })

  it('derives a BarkOS-only WSL bridge path', () => {
    expect(_internals.getBridgePathFromCommandPath(COMMAND_PATH)).toBe(BRIDGE_PATH)
    expect(_internals.getBridgePathFromCommandPath('/home/alice/.local/bin/orca')).not.toContain(
      '/.local/share/barkos'
    )
  })

  it('reports installed commands whose bin directory is missing from PATH', async () => {
    const launcher = _internals.buildWslLauncher(WINDOWS_LAUNCHER, BRIDGE_PATH)
    const wsl = createWslRunner({ command: launcher, pathConfigured: false })
    const installer = new WslCliInstaller({
      platform: 'win32',
      distro: 'Ubuntu',
      hostInstaller: { getStatus: async () => makeHostStatus() },
      wslRunner: wsl.runner
    })

    await expect(installer.getStatus()).resolves.toMatchObject({
      state: 'installed',
      pathConfigured: false,
      detail: expect.stringContaining('not on PATH')
    })
  })

  it('refuses to replace an unmanaged BarkOS command', async () => {
    const wsl = createWslRunner({ command: '#!/bin/sh\necho user-owned\n' })
    const installer = new WslCliInstaller({
      platform: 'win32',
      distro: 'Ubuntu',
      hostInstaller: { getStatus: async () => makeHostStatus() },
      wslRunner: wsl.runner
    })

    await expect(installer.getStatus()).resolves.toMatchObject({ state: 'conflict' })
    await expect(installer.install()).rejects.toThrow('Refusing to replace')
  })

  it('removes only the managed BarkOS command and bridge', async () => {
    const launcher = _internals.buildWslLauncher(WINDOWS_LAUNCHER, BRIDGE_PATH)
    const wsl = createWslRunner({ command: launcher })
    const installer = new WslCliInstaller({
      platform: 'win32',
      distro: 'Ubuntu',
      hostInstaller: { getStatus: async () => makeHostStatus() },
      wslRunner: wsl.runner
    })

    await expect(installer.remove()).resolves.toMatchObject({ state: 'not_installed' })
    expect(wsl.getCommand()).toBeNull()
    expect(wsl.getBridge()).toBeNull()
  })

  it('repairs stale managed launchers without touching Orca paths', async () => {
    const stale = _internals.buildWslLauncher(
      'C:\\Old BarkOS\\resources\\bin\\barkos.exe',
      BRIDGE_PATH
    )
    const wsl = createWslRunner({ command: stale })
    const installer = new WslCliInstaller({
      platform: 'win32',
      distro: 'Ubuntu',
      hostInstaller: { getStatus: async () => makeHostStatus() },
      wslRunner: wsl.runner
    })

    await expect(installer.repairManagedRegistration()).resolves.toMatchObject({
      changed: true,
      managed: true,
      status: { state: 'installed', currentTarget: WINDOWS_LAUNCHER }
    })
    expect(wsl.calls.join('\n')).not.toContain("/home/alice/.local/bin/orca'")
  })

  it('preserves a user-owned bridge during repair and removal', async () => {
    const launcher = _internals.buildWslLauncher(WINDOWS_LAUNCHER, BRIDGE_PATH)
    const wsl = createWslRunner({ command: launcher, bridge: 'user bridge\n' })
    const installer = new WslCliInstaller({
      platform: 'win32',
      distro: 'Ubuntu',
      hostInstaller: { getStatus: async () => makeHostStatus() },
      wslRunner: wsl.runner
    })

    await expect(installer.repairManagedRegistration()).resolves.toMatchObject({
      changed: false,
      managed: true,
      status: { state: 'conflict' }
    })
    await expect(installer.remove()).rejects.toThrow('Refusing to remove non-Orca command')
    expect(wsl.getBridge()).toBe('user bridge\n')
  })

  it('keeps managed files when transactional replacement fails', async () => {
    const stale = _internals.buildWslLauncher(
      'C:\\Old BarkOS\\resources\\bin\\barkos.exe',
      BRIDGE_PATH
    )
    const bridge = _internals.buildWslBridgeScript()
    const wsl = createWslRunner({ command: stale, bridge, failInstall: true })
    const installer = new WslCliInstaller({
      platform: 'win32',
      distro: 'Ubuntu',
      hostInstaller: { getStatus: async () => makeHostStatus() },
      wslRunner: wsl.runner
    })

    await expect(installer.repairManagedRegistration()).rejects.toThrow(
      'simulated replacement failure'
    )
    expect(wsl.getCommand()).toBe(stale)
    expect(wsl.getBridge()).toBe(bridge)
  })

  it('generates a PowerShell bridge that forwards cwd and exit status', () => {
    const launcher = _internals.buildWslLauncher(WINDOWS_LAUNCHER, BRIDGE_PATH)
    const bridge = _internals.buildWslBridgeScript()

    expect(launcher).toContain('command -v powershell.exe')
    expect(launcher).toContain('ORCA_WSL_CWD_WIN=$(wslpath -w "$ORCA_WSL_CWD")')
    expect(launcher).toContain('"$ORCA_WIN_LAUNCHER" -WslCwd "$ORCA_WSL_CWD_WIN" "$@"')
    expect(bridge).toContain("$args[1] -eq '-WslCwd'")
    expect(bridge).toContain('$Process.WaitForExit()')
    expect(bridge).toContain('$exitCode = $Process.ExitCode')
  })

  it('settles when wsl.exe never reports completion', async () => {
    vi.useFakeTimers()
    const killMock = vi.fn()
    execFileMock.mockImplementation(() => ({ kill: killMock }))
    const installer = new WslCliInstaller({
      platform: 'win32',
      distro: 'Ubuntu',
      hostInstaller: { getStatus: async () => makeHostStatus() }
    })

    const promise = installer.getStatus()
    const rejection = expect(promise).rejects.toThrow('WSL command timed out')
    await vi.advanceTimersByTimeAsync(10_000)

    await rejection
    expect(killMock).toHaveBeenCalled()
  })
})
