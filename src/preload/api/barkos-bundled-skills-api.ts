import type {
  BundledSkillInstallResult,
  BundledSkillStatus
} from '../../shared/bundled-skill-local-install'

export type BarkosBundledSkillsApi = {
  status: () => Promise<BundledSkillStatus>
  install: (request: {
    skills: readonly string[]
    agents?: readonly string[]
  }) => Promise<BundledSkillInstallResult>
}
