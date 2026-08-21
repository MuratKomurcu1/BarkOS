import { isSkillsCliAgentKeyShaped } from './skills-cli-agent-keys'

/**
 * Home-relative skill directories for the agent keys BarkOS installs bundled
 * skills into directly, without the external `skills` CLI or any upstream
 * repository. The paths mirror the home roots skill discovery scans, so a local
 * install becomes visible to discovery on its next scan without extra wiring.
 */
export const BUNDLED_SKILL_AGENT_HOME_DIRS: Readonly<Record<string, string>> = {
  universal: '.agents/skills',
  'claude-code': '.claude/skills',
  codex: '.codex/skills',
  'gemini-cli': '.gemini/skills',
  antigravity: '.gemini/antigravity/skills',
  cursor: '.cursor/skills',
  droid: '.factory/skills',
  continue: '.continue/skills',
  'trae-cn': '.trae-cn/skills',
  augment: '.augment/skills',
  opencode: '.config/opencode/skills',
  pi: '.pi/agent/skills',
  grok: '.grok/skills'
}

export const BUNDLED_SKILL_UNIVERSAL_AGENT_KEY = 'universal'

export const BUNDLED_SKILL_INSTALL_MAX_SKILLS = 16
export const BUNDLED_SKILL_INSTALL_MAX_AGENTS = 32

export type BundledSkillPlacementOutcome =
  | 'written'
  | 'already-current'
  | 'conflict'
  | 'not-installed'
  | 'unsupported-agent'
  | 'error'

export type BundledSkillPlacement = {
  agentKey: string
  directory: string
  skillFilePath: string
  outcome: BundledSkillPlacementOutcome
  detail?: string
}

export type BundledSkillInstallOutcome = {
  skill: string
  placements: readonly BundledSkillPlacement[]
}

export type BundledSkillInstallResult = {
  outcomes: readonly BundledSkillInstallOutcome[]
}

export type BundledSkillStatusState = 'not-installed' | 'current' | 'stale'

export type BundledSkillStatusEntry = {
  skill: string
  installedDirectories: readonly string[]
  state: BundledSkillStatusState
}

export type BundledSkillStatus = {
  skills: readonly BundledSkillStatusEntry[]
}

export class BundledSkillInstallRequestError extends Error {}

/**
 * Validates and normalizes an install request from the renderer or CLI flags:
 * bounded skill names against the bundled registry and shaped agent keys only,
 * because an unshaped key would silently widen the install target set.
 */
export function validateBundledSkillInstallRequest(input: { skills: unknown; agents?: unknown }): {
  skills: string[]
  agents: string[]
} {
  const rawSkills = input.skills
  if (!Array.isArray(rawSkills) || rawSkills.length === 0) {
    throw new BundledSkillInstallRequestError('At least one bundled skill name is required.')
  }
  if (rawSkills.length > BUNDLED_SKILL_INSTALL_MAX_SKILLS) {
    throw new BundledSkillInstallRequestError(
      `At most ${BUNDLED_SKILL_INSTALL_MAX_SKILLS} skills can be installed at once.`
    )
  }
  const skills: string[] = []
  for (const entry of rawSkills) {
    if (typeof entry !== 'string') {
      throw new BundledSkillInstallRequestError('Skill names must be strings.')
    }
    const trimmed = entry.trim()
    if (trimmed.length === 0) {
      throw new BundledSkillInstallRequestError('Skill names must not be blank.')
    }
    if (!skills.includes(trimmed)) {
      skills.push(trimmed)
    }
  }

  const rawAgents = input.agents ?? []
  if (!Array.isArray(rawAgents)) {
    throw new BundledSkillInstallRequestError('Agents must be an array of agent keys.')
  }
  if (rawAgents.length > BUNDLED_SKILL_INSTALL_MAX_AGENTS) {
    throw new BundledSkillInstallRequestError(
      `At most ${BUNDLED_SKILL_INSTALL_MAX_AGENTS} agent targets are allowed.`
    )
  }
  const agents: string[] = []
  for (const entry of rawAgents) {
    if (typeof entry !== 'string') {
      throw new BundledSkillInstallRequestError('Agent keys must be strings.')
    }
    const trimmed = entry.trim()
    if (trimmed.length === 0) {
      continue
    }
    // Why: a `-`-leading key historically meant "all agents" to the external
    // skills CLI; the local installer never widens targets, so reject the shape.
    if (!isSkillsCliAgentKeyShaped(trimmed)) {
      throw new BundledSkillInstallRequestError(`"${trimmed}" is not a usable install target.`)
    }
    if (!agents.includes(trimmed)) {
      agents.push(trimmed)
    }
  }
  if (agents.length === 0) {
    agents.push(BUNDLED_SKILL_UNIVERSAL_AGENT_KEY)
  }
  return { skills, agents }
}
