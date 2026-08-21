import {
  COMPUTER_USE_SKILL_NAME,
  ORCA_LINEAR_SKILL_NAME,
  ORCA_CLI_SKILL_NAME,
  ORCHESTRATION_SKILL_NAME,
  buildAgentFeatureSkillInstallCommand
} from '@/lib/agent-feature-install-commands'
import type { ProjectAgentSkillRuntime } from '@/lib/project-skill-runtime'
import type {
  BundledSkillInstallResult,
  BundledSkillStatus
} from '../../../../shared/bundled-skill-local-install'
import { buildSkillCommandForRuntime } from '../settings/CliSkillRuntimeSetup'
import { translate } from '@/i18n/i18n'

export type OnboardingFeatureSetupId =
  | 'browserUse'
  | 'computerUse'
  | 'orchestration'
  | 'linearTickets'

export type OnboardingFeatureSetupSelection = Record<OnboardingFeatureSetupId, boolean>

export const DEFAULT_ONBOARDING_FEATURE_SETUP_SELECTION: OnboardingFeatureSetupSelection = {
  browserUse: true,
  computerUse: true,
  orchestration: true,
  linearTickets: false
}

export const ONBOARDING_FEATURE_SETUP_IDS: readonly OnboardingFeatureSetupId[] = [
  'browserUse',
  'computerUse',
  'orchestration',
  'linearTickets'
]

export const FEATURE_SKILL_NAMES: Record<OnboardingFeatureSetupId, string> = {
  browserUse: ORCA_CLI_SKILL_NAME,
  computerUse: COMPUTER_USE_SKILL_NAME,
  orchestration: ORCHESTRATION_SKILL_NAME,
  linearTickets: ORCA_LINEAR_SKILL_NAME
}

export type OnboardingFeatureSetupWarning = {
  featureId: OnboardingFeatureSetupId | 'cli' | 'skills'
  message: string
}

type SkillInstallChannel = {
  installBundledSkills: (skills: readonly string[]) => Promise<BundledSkillInstallResult>
  getBundledSkillsStatus: () => Promise<BundledSkillStatus>
  writeClipboardText: (text: string) => Promise<void>
}

export function hasSelectedOnboardingFeatureSetup(
  selection: OnboardingFeatureSetupSelection
): boolean {
  return ONBOARDING_FEATURE_SETUP_IDS.some((id) => selection[id])
}

export function selectedOnboardingFeatureSetupIds(
  selection: OnboardingFeatureSetupSelection
): OnboardingFeatureSetupId[] {
  return ONBOARDING_FEATURE_SETUP_IDS.filter((id) => selection[id])
}

export function buildOnboardingFeatureSetupClipboardText(
  selection: OnboardingFeatureSetupSelection,
  agentRuntime?: ProjectAgentSkillRuntime
): string | null {
  const command = buildOnboardingFeatureSetupSkillCommand(selection)
  // Keep clipboard and terminal commands on the same runtime (#12103).
  return command === null ? null : buildSkillCommandForRuntime(command, agentRuntime)
}

export function buildOnboardingFeatureSetupSkillCommand(
  selection: OnboardingFeatureSetupSelection
): string | null {
  const skillNames = selectedOnboardingFeatureSetupIds(selection).map(
    (id) => FEATURE_SKILL_NAMES[id]
  )
  if (skillNames.length === 0) {
    return null
  }
  return buildAgentFeatureSkillInstallCommand(skillNames)
}

export function formatFeatureSetupError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Installs the selected feature skills directly from the bundled registry and
 * verifies them on disk. Returns false only when the install channel itself is
 * unavailable, so the caller can fall back to handing the user a command.
 */
export async function installSelectedSkills(
  selectedIds: OnboardingFeatureSetupId[],
  deps: SkillInstallChannel,
  warnings: OnboardingFeatureSetupWarning[]
): Promise<boolean> {
  const skillNames = [...new Set(selectedIds.map((id) => FEATURE_SKILL_NAMES[id]))]
  try {
    await deps.installBundledSkills(skillNames)
  } catch {
    return false
  }
  try {
    const status = await deps.getBundledSkillsStatus()
    const byName = new Map(status.skills.map((entry) => [entry.skill.toLowerCase(), entry]))
    for (const id of selectedIds) {
      const name = FEATURE_SKILL_NAMES[id]
      const entry = byName.get(name.toLowerCase())
      if (!entry || entry.state === 'not-installed') {
        warnings.push({
          featureId: id,
          message: translate(
            'auto.components.onboarding.onboarding.feature.setup.skills.cbb078645b',
            '"{{value0}}" could not be verified as installed on this machine.',
            { value0: name }
          )
        })
      }
    }
  } catch (error) {
    warnings.push({ featureId: 'skills', message: formatFeatureSetupError(error) })
  }
  return true
}

export async function copySkillCommands(
  selection: OnboardingFeatureSetupSelection,
  deps: Pick<SkillInstallChannel, 'writeClipboardText'>,
  warnings: OnboardingFeatureSetupWarning[],
  agentRuntime?: ProjectAgentSkillRuntime
): Promise<boolean> {
  const clipboardText = buildOnboardingFeatureSetupClipboardText(selection, agentRuntime)
  if (!clipboardText) {
    return false
  }
  try {
    await deps.writeClipboardText(clipboardText)
    return true
  } catch (error) {
    warnings.push({ featureId: 'skills', message: formatFeatureSetupError(error) })
    return false
  }
}
