import type { CliInstallStatus } from '../../../../shared/cli-install-types'
import type {
  ComputerUsePermissionSetupResult,
  ComputerUsePermissionStatusResult
} from '../../../../shared/computer-use-permissions-types'
import { BROWSER_USE_ENABLED_STORAGE_KEY } from '@/lib/browser-use-setup-state'
import { e2eConfig } from '@/lib/e2e-config'
import { showOrcaCliRegistrationPromptToast } from '@/lib/agent-skill-cli-prerequisite'
import type { ProjectAgentSkillRuntime } from '@/lib/project-skill-runtime'
import type {
  BundledSkillInstallResult,
  BundledSkillStatus
} from '../../../../shared/bundled-skill-local-install'
import type { OnboardingFeatureSetupRuntimeContext } from './onboarding-feature-setup-runtime'
import {
  buildOnboardingFeatureSetupSkillCommand,
  copySkillCommands,
  formatFeatureSetupError,
  installSelectedSkills,
  selectedOnboardingFeatureSetupIds,
  type OnboardingFeatureSetupId,
  type OnboardingFeatureSetupSelection,
  type OnboardingFeatureSetupWarning
} from './onboarding-feature-setup-skills'
import {
  ORCHESTRATION_ENABLED_STORAGE_KEY,
  ORCHESTRATION_SETUP_DISMISSED_STORAGE_KEY,
  notifyOrchestrationSetupStateChanged
} from '@/lib/orchestration-setup-state'
import type { EventProps } from '../../../../shared/telemetry-events'
import { getWslCliDistroRequest } from '../settings/CliSkillRuntimeSetup'

export type {
  OnboardingFeatureSetupId,
  OnboardingFeatureSetupSelection,
  OnboardingFeatureSetupWarning
} from './onboarding-feature-setup-skills'
export {
  DEFAULT_ONBOARDING_FEATURE_SETUP_SELECTION,
  ONBOARDING_FEATURE_SETUP_IDS,
  buildOnboardingFeatureSetupClipboardText,
  buildOnboardingFeatureSetupSkillCommand,
  hasSelectedOnboardingFeatureSetup,
  selectedOnboardingFeatureSetupIds
} from './onboarding-feature-setup-skills'

const ONBOARDING_PROGRESS_FEATURE_SETUP_IDS: readonly OnboardingFeatureSetupId[] = [
  'browserUse',
  'computerUse',
  'orchestration'
]

const FEATURE_TELEMETRY_IDS: Record<
  OnboardingFeatureSetupId,
  EventProps<'onboarding_feature_setup_toggled'>['feature']
> = {
  browserUse: 'browser_use',
  computerUse: 'computer_use',
  orchestration: 'orchestration',
  linearTickets: 'linear_tickets'
}

export type OnboardingFeatureSetupResult = {
  selectedIds: OnboardingFeatureSetupId[]
  cliTouched: boolean
  skillCommandsCopied: boolean
  skillInstallCommand: string | null
  computerUsePermissionsOpened: boolean
  warnings: OnboardingFeatureSetupWarning[]
}

export type OnboardingFeatureSetupDeps = {
  getCliStatus: () => Promise<CliInstallStatus>
  showCliRegistrationPrompt?: () => Promise<void>
  installCli: () => Promise<CliInstallStatus>
  writeClipboardText: (text: string) => Promise<void>
  installBundledSkills: (skills: readonly string[]) => Promise<BundledSkillInstallResult>
  getBundledSkillsStatus: () => Promise<BundledSkillStatus>
  getComputerUsePermissionStatus: () => Promise<ComputerUsePermissionStatusResult>
  openComputerUsePermissionSetup: () => Promise<ComputerUsePermissionSetupResult>
  setStorageItem: (key: string, value: string) => void
  removeStorageItem: (key: string) => void
  notifyOrchestrationStateChanged: () => void
}

export function onboardingFeatureSetupTelemetryFeature(
  id: OnboardingFeatureSetupId
): EventProps<'onboarding_feature_setup_toggled'>['feature'] {
  return FEATURE_TELEMETRY_IDS[id]
}

export function onboardingFeatureSetupTelemetrySelection(
  selection: OnboardingFeatureSetupSelection
): EventProps<'onboarding_feature_setup_terminal_opened'> {
  return {
    browser_use: selection.browserUse,
    computer_use: selection.computerUse,
    linear_tickets: selection.linearTickets,
    orchestration: selection.orchestration,
    // Why: Linear skill setup is a recommended add-on, not onboarding progress.
    selected_count: selectedOnboardingProgressFeatureSetupIds(selection).length
  }
}

function selectedOnboardingProgressFeatureSetupIds(
  selection: OnboardingFeatureSetupSelection
): OnboardingFeatureSetupId[] {
  return ONBOARDING_PROGRESS_FEATURE_SETUP_IDS.filter((id) => selection[id])
}

export function onboardingFeatureSetupRunTelemetry(
  selection: OnboardingFeatureSetupSelection,
  result: OnboardingFeatureSetupResult
): EventProps<'onboarding_feature_setup_run'> {
  return {
    ...onboardingFeatureSetupTelemetrySelection(selection),
    cli_touched: result.cliTouched,
    skill_commands_copied: result.skillCommandsCopied,
    skill_install_command_prepared: result.skillInstallCommand !== null,
    computer_use_permissions_opened: result.computerUsePermissionsOpened,
    warning_count: result.warnings.length
  }
}

export function createOnboardingFeatureSetupDeps(
  agentRuntime?: ProjectAgentSkillRuntime
): OnboardingFeatureSetupDeps {
  const e2eDeps = getE2EOnboardingFeatureSetupDeps()
  if (e2eDeps) {
    return e2eDeps
  }

  // Register `orca` on the same PATH used by the skill install (#12103).
  const wslDistroRequest =
    agentRuntime?.runtime === 'wsl' ? getWslCliDistroRequest(agentRuntime) : undefined
  const isWsl = agentRuntime?.runtime === 'wsl'
  return {
    getCliStatus: () =>
      isWsl
        ? window.api.cli.getWslInstallStatus(wslDistroRequest)
        : window.api.cli.getInstallStatus(),
    showCliRegistrationPrompt: showOrcaCliRegistrationPromptToast,
    installCli: () =>
      isWsl ? window.api.cli.installWsl(wslDistroRequest) : window.api.cli.install(),
    writeClipboardText: (text) => window.api.ui.writeClipboardText(text),
    // Why: bundled skills install straight from the app's own registry, so the
    // setup step never depends on the external skills CLI or any remote repo.
    installBundledSkills: (skills) => window.api.barkosBundledSkills.install({ skills }),
    getBundledSkillsStatus: () => window.api.barkosBundledSkills.status(),
    getComputerUsePermissionStatus: () => window.api.computerUsePermissions.getStatus(),
    openComputerUsePermissionSetup: () => window.api.computerUsePermissions.openSetup(),
    setStorageItem: (key, value) => localStorage.setItem(key, value),
    removeStorageItem: (key) => localStorage.removeItem(key),
    notifyOrchestrationStateChanged: notifyOrchestrationSetupStateChanged
  }
}

function getE2EOnboardingFeatureSetupDeps(): OnboardingFeatureSetupDeps | null {
  if (!e2eConfig.enabled || typeof window === 'undefined') {
    return null
  }
  return (
    (window as unknown as { __onboardingFeatureSetupDeps?: OnboardingFeatureSetupDeps })
      .__onboardingFeatureSetupDeps ?? null
  )
}

export async function runOnboardingFeatureSetup(
  selection: OnboardingFeatureSetupSelection,
  explicitDeps?: OnboardingFeatureSetupDeps,
  runtimeContext?: OnboardingFeatureSetupRuntimeContext
): Promise<OnboardingFeatureSetupResult> {
  const agentRuntime = runtimeContext?.installDisabledReason
    ? undefined
    : runtimeContext?.agentRuntime
  const deps = explicitDeps ?? createOnboardingFeatureSetupDeps(agentRuntime)
  const selectedIds = selectedOnboardingFeatureSetupIds(selection)
  const warnings: OnboardingFeatureSetupWarning[] = []
  let cliTouched = false
  let skillCommandsCopied = false
  const skillInstallCommand = buildOnboardingFeatureSetupSkillCommand(selection)
  let computerUsePermissionsOpened = false

  deps.setStorageItem(BROWSER_USE_ENABLED_STORAGE_KEY, selection.browserUse ? '1' : '0')
  deps.setStorageItem(ORCHESTRATION_ENABLED_STORAGE_KEY, selection.orchestration ? '1' : '0')
  if (selection.orchestration) {
    deps.removeStorageItem(ORCHESTRATION_SETUP_DISMISSED_STORAGE_KEY)
  }
  deps.notifyOrchestrationStateChanged()

  if (selectedIds.length === 0) {
    return {
      selectedIds,
      cliTouched,
      skillCommandsCopied,
      skillInstallCommand,
      computerUsePermissionsOpened,
      warnings
    }
  }

  try {
    const status = await deps.getCliStatus()
    if (!status.supported) {
      warnings.push({
        featureId: 'cli',
        message: status.detail ?? 'Orca CLI registration is not available on this platform.'
      })
    } else if (status.pathConfigured === null) {
      // Why: an unknown registry read cannot safely drive a PATH read-modify-write.
      warnings.push({
        featureId: 'cli',
        message: status.detail ?? 'Orca could not check your Windows user PATH.'
      })
    } else if (status.state !== 'installed' || status.pathConfigured === false) {
      await deps.showCliRegistrationPrompt?.()
      const next = await deps.installCli()
      cliTouched = true
      if (next.state !== 'installed') {
        warnings.push({
          featureId: 'cli',
          message: next.detail ?? 'Orca CLI registration needs attention.'
        })
      } else if (next.pathConfigured !== true && next.detail) {
        warnings.push({ featureId: 'cli', message: next.detail })
      }
    }
  } catch (error) {
    warnings.push({ featureId: 'cli', message: formatFeatureSetupError(error) })
  }

  if (selection.computerUse) {
    try {
      const status = await deps.getComputerUsePermissionStatus()
      // Why: when the macOS helper app is missing (e.g. dev builds without
      // `pnpm build:computer-macos`), the status reports all permissions as
      // not-granted alongside a helperUnavailableReason. Without this guard we
      // would call openSetup, which throws an IPC handler error instead of
      // degrading gracefully.
      if (status.helperUnavailableReason) {
        warnings.push({
          featureId: 'computerUse',
          message: status.helperUnavailableReason
        })
      } else {
        const needsMacPermissions =
          status.platform === 'darwin' &&
          status.permissions.some((permission) => permission.status !== 'granted')
        if (needsMacPermissions) {
          await deps.openComputerUsePermissionSetup()
          computerUsePermissionsOpened = true
        }
      }
    } catch (error) {
      warnings.push({
        featureId: 'computerUse',
        message: formatFeatureSetupError(error)
      })
    }
  }

  const skillsInstalled = await installSelectedSkills(selectedIds, deps, warnings)
  if (!skillsInstalled) {
    skillCommandsCopied = await copySkillCommands(selection, deps, warnings, agentRuntime)
  }

  return {
    selectedIds,
    cliTouched,
    skillCommandsCopied,
    skillInstallCommand,
    computerUsePermissionsOpened,
    warnings
  }
}
