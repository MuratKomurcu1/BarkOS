import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SFTPWrapper } from 'ssh2'
import type { AgentHookInstallState, AgentHookInstallStatus } from '../../shared/agent-hook-types'
import {
  buildManagedCommandHook,
  createManagedCommandMatcher,
  getSharedManagedScriptPath,
  MANAGED_HOOK_TIMEOUT_MILLISECONDS,
  readHooksJson,
  removeManagedCommands,
  wrapPosixHookCommand,
  wrapWindowsHookCommand,
  writeHooksJson,
  writeManagedScript,
  type HookDefinition
} from '../agent-hooks/installer-utils'
import { refreshManagedScriptIfPresent } from '../agent-hooks/managed-hook-script-refresh'
import {
  readHooksJsonRemote,
  writeHooksJsonRemote,
  writeManagedScriptRemote
} from '../agent-hooks/installer-utils-remote'
import { getGeminiManagedHookScript } from './managed-hook-script'

// Why: Gemini has no permission-prompt hook (approvals are inline UI), so Orca can't show a waiting state — upstream limitation.
// Why: Gemini's pre-tool event is BeforeTool, not Claude/Codex's PreToolUse; sweep stale PreToolUse entries below.
const GEMINI_EVENTS = ['BeforeAgent', 'AfterAgent', 'AfterTool', 'BeforeTool'] as const
const GEMINI_MANAGED_HOOK_NAME = 'orca-managed-gemini'

function disabledHookDetail(config: Record<string, unknown>): string | null {
  const hooksConfig = config.hooksConfig
  if (typeof hooksConfig !== 'object' || hooksConfig === null || Array.isArray(hooksConfig)) {
    return null
  }
  const settings = hooksConfig as Record<string, unknown>
  if (settings.enabled === false) {
    return 'Gemini hooks are disabled in settings'
  }
  return Array.isArray(settings.disabled) && settings.disabled.includes(GEMINI_MANAGED_HOOK_NAME)
    ? 'BarkOS managed Gemini hook is disabled in settings'
    : null
}

function getConfigPath(): string {
  return join(homedir(), '.gemini', 'settings.json')
}

function getManagedScriptFileName(): string {
  return process.platform === 'win32' ? 'gemini-hook.cmd' : 'gemini-hook.sh'
}

function getManagedScriptPath(): string {
  return getSharedManagedScriptPath(getManagedScriptFileName())
}

function getManagedCommand(scriptPath: string): string {
  return process.platform === 'win32'
    ? wrapWindowsHookCommand(scriptPath)
    : wrapPosixHookCommand(scriptPath)
}

export class GeminiHookService {
  async refreshManagedScripts(): Promise<void> {
    await refreshManagedScriptIfPresent(getManagedScriptPath(), getGeminiManagedHookScript())
  }

  getStatus(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    const scriptPath = getManagedScriptPath()
    const config = readHooksJson(configPath)
    if (!config) {
      return {
        agent: 'gemini',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: 'Could not parse Gemini settings.json'
      }
    }

    const command = getManagedCommand(scriptPath)
    const missing: string[] = []
    let presentCount = 0
    for (const eventName of GEMINI_EVENTS) {
      const definitions = Array.isArray(config.hooks?.[eventName]) ? config.hooks![eventName]! : []
      const hasCommand = definitions.some((definition) =>
        (definition.hooks ?? []).some((hook) => hook.command === command)
      )
      if (hasCommand) {
        presentCount += 1
      } else {
        missing.push(eventName)
      }
    }
    const managedHooksPresent = presentCount > 0
    const disabledDetail = disabledHookDetail(config)
    let state: AgentHookInstallState
    let detail: string | null
    if (missing.length === 0 && !disabledDetail) {
      state = 'installed'
      detail = null
    } else if (missing.length === 0) {
      state = 'partial'
      detail = disabledDetail
    } else if (presentCount === 0) {
      state = 'not_installed'
      detail = null
    } else {
      state = 'partial'
      detail = `Managed hook missing for events: ${missing.join(', ')}`
    }
    return { agent: 'gemini', state, configPath, managedHooksPresent, detail }
  }

  install(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    const scriptPath = getManagedScriptPath()
    const config = readHooksJson(configPath)
    if (!config) {
      return {
        agent: 'gemini',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: 'Could not parse Gemini settings.json'
      }
    }

    const command = getManagedCommand(scriptPath)
    const nextHooks = { ...config.hooks }

    // Why: match by filename not exact command, so installs sweep stale entries instead of duplicating them.
    const isManagedCommand = createManagedCommandMatcher(getManagedScriptFileName())

    const managedEvents = new Set<string>(GEMINI_EVENTS)

    // Why: sweep managed entries from dropped event buckets so stale hooks (e.g. PreToolUse) don't keep firing.
    for (const [eventName, definitions] of Object.entries(nextHooks)) {
      if (managedEvents.has(eventName)) {
        continue
      }
      if (!Array.isArray(definitions)) {
        continue
      }
      const cleaned = removeManagedCommands(definitions, isManagedCommand)
      if (cleaned.length === 0) {
        delete nextHooks[eventName]
      } else {
        nextHooks[eventName] = cleaned
      }
    }

    for (const eventName of GEMINI_EVENTS) {
      const current = Array.isArray(nextHooks[eventName]) ? nextHooks[eventName] : []
      const cleaned = removeManagedCommands(current, isManagedCommand)
      const definition: HookDefinition = {
        // Why: Gemini's hook `timeout` unit is milliseconds, unlike Claude/Codex.
        hooks: [
          {
            ...buildManagedCommandHook(command, MANAGED_HOOK_TIMEOUT_MILLISECONDS),
            name: GEMINI_MANAGED_HOOK_NAME
          }
        ]
      }
      nextHooks[eventName] = [...cleaned, definition]
    }

    config.hooks = nextHooks
    writeManagedScript(scriptPath, getGeminiManagedHookScript())
    writeHooksJson(configPath, config)
    return this.getStatus()
  }

  // POSIX-only remote install mirroring ClaudeHookService.installRemote; the managed script/JSON shape must match local install() or remote panes report a different status.
  async installRemote(sftp: SFTPWrapper, remoteHome: string): Promise<AgentHookInstallStatus> {
    const remoteConfigPath = `${remoteHome.replace(/\/$/, '')}/.gemini/settings.json`
    const remoteScriptPath = `${remoteHome.replace(/\/$/, '')}/.orca/agent-hooks/gemini-hook.sh`
    try {
      const config = await readHooksJsonRemote(sftp, remoteConfigPath)
      if (!config) {
        return {
          agent: 'gemini',
          state: 'error',
          configPath: remoteConfigPath,
          managedHooksPresent: false,
          detail: 'Could not parse remote Gemini settings.json'
        }
      }

      const command = wrapPosixHookCommand(remoteScriptPath)
      const nextHooks = { ...config.hooks }
      const isManagedCommand = createManagedCommandMatcher('gemini-hook.sh')
      const managedEvents = new Set<string>(GEMINI_EVENTS)

      // Why: sweep legacy managed event buckets so stale PreToolUse stops warning in SSH Gemini sessions.
      for (const [eventName, definitions] of Object.entries(nextHooks)) {
        if (managedEvents.has(eventName)) {
          continue
        }
        if (!Array.isArray(definitions)) {
          continue
        }
        const cleaned = removeManagedCommands(definitions, isManagedCommand)
        if (cleaned.length === 0) {
          delete nextHooks[eventName]
        } else {
          nextHooks[eventName] = cleaned
        }
      }

      for (const eventName of GEMINI_EVENTS) {
        const current = Array.isArray(nextHooks[eventName]) ? nextHooks[eventName] : []
        const cleaned = removeManagedCommands(current, isManagedCommand)
        const definition: HookDefinition = {
          // Why: Gemini's hook `timeout` unit is milliseconds, unlike Claude/Codex.
          hooks: [
            {
              ...buildManagedCommandHook(command, MANAGED_HOOK_TIMEOUT_MILLISECONDS),
              name: GEMINI_MANAGED_HOOK_NAME
            }
          ]
        }
        nextHooks[eventName] = [...cleaned, definition]
      }
      config.hooks = nextHooks

      // Why: write the script before settings.json so an interrupted install never points at a missing script.
      // Why: SSH remotes always use POSIX `.sh` paths even when Orca runs on Windows.
      await writeManagedScriptRemote(sftp, remoteScriptPath, getGeminiManagedHookScript('posix'))
      await writeHooksJsonRemote(sftp, remoteConfigPath, config)

      const disabledDetail = disabledHookDetail(config)
      return {
        agent: 'gemini',
        state: disabledDetail ? 'partial' : 'installed',
        configPath: remoteConfigPath,
        managedHooksPresent: true,
        detail: disabledDetail
      }
    } catch (err) {
      return {
        agent: 'gemini',
        state: 'error',
        configPath: remoteConfigPath,
        managedHooksPresent: false,
        detail: err instanceof Error ? err.message : String(err)
      }
    }
  }

  remove(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    const config = readHooksJson(configPath)
    if (!config) {
      return {
        agent: 'gemini',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: 'Could not parse Gemini settings.json'
      }
    }

    const nextHooks = { ...config.hooks }
    // Why: match by filename so remove() sweeps stale entries even after the script path moved.
    const isManagedCommand = createManagedCommandMatcher(getManagedScriptFileName())
    for (const [eventName, definitions] of Object.entries(nextHooks)) {
      // Why: fail open on malformed (non-array) entries so a broken user config never blocks uninstall.
      if (!Array.isArray(definitions)) {
        continue
      }
      const cleaned = removeManagedCommands(definitions, isManagedCommand)
      if (cleaned.length === 0) {
        delete nextHooks[eventName]
      } else {
        nextHooks[eventName] = cleaned
      }
    }
    config.hooks = nextHooks
    writeHooksJson(configPath, config)
    return this.getStatus()
  }
}

export const geminiHookService = new GeminiHookService()
