import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  BUNDLED_SKILL_AGENT_HOME_DIRS,
  BUNDLED_SKILL_UNIVERSAL_AGENT_KEY,
  type BundledSkillInstallOutcome,
  type BundledSkillInstallResult,
  type BundledSkillPlacement,
  type BundledSkillPlacementOutcome,
  type BundledSkillStatus,
  type BundledSkillStatusEntry
} from '../../shared/bundled-skill-local-install'

export type BundledSkillGuideSource = {
  name: string
  markdown: string
}

export type BundledSkillInstallMode = 'install' | 'update'

export type InstallBundledSkillsLocallyInput = {
  skills: readonly string[]
  agents: readonly string[]
  mode: BundledSkillInstallMode
  guides: readonly BundledSkillGuideSource[]
  homeDir?: string
  dryRun?: boolean
  /**
   * Project scope (`--local`): install into `<projectDir>/.agents/skills`
   * instead of per-agent homes, matching the shared universal directory.
   */
  projectDir?: string
}

function resolveGuide(
  guides: readonly BundledSkillGuideSource[],
  skill: string
): BundledSkillGuideSource | undefined {
  const needle = skill.toLowerCase()
  return guides.find((guide) => guide.name.toLowerCase() === needle)
}

async function readExistingSkillFile(skillFilePath: string): Promise<string | null> {
  try {
    return await readFile(skillFilePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

/**
 * Installs bundled skills straight into agent homes on disk. No network, no
 * child process, no upstream repository: the guide markdown is the source.
 *
 * Semantics per skill x agent:
 * - install: missing -> write; identical -> already-current; differs -> conflict (never clobber)
 * - update: missing -> not-installed; identical -> already-current; differs -> overwrite
 */
export async function installBundledSkillsLocally(
  input: InstallBundledSkillsLocallyInput
): Promise<BundledSkillInstallResult> {
  const homeDir = input.homeDir ?? homedir()
  // Why: project scope has exactly one shared target, so per-agent homes and
  // their unsupported-agent reporting do not apply there.
  const scopedAgents =
    input.projectDir !== undefined ? [BUNDLED_SKILL_UNIVERSAL_AGENT_KEY] : input.agents
  const outcomes: BundledSkillInstallOutcome[] = []
  for (const skill of input.skills) {
    const guide = resolveGuide(input.guides, skill)
    const placements: BundledSkillPlacement[] = []
    for (const agentKey of scopedAgents) {
      const relativeDir = BUNDLED_SKILL_AGENT_HOME_DIRS[agentKey]
      if (relativeDir === undefined) {
        placements.push({
          agentKey,
          directory: '',
          skillFilePath: '',
          outcome: 'unsupported-agent',
          detail: `"${agentKey}" has no known skill directory.`
        })
        continue
      }
      const directory =
        input.projectDir !== undefined
          ? join(input.projectDir, relativeDir)
          : join(homeDir, relativeDir)
      const skillFilePath = join(directory, guide?.name ?? skill, 'SKILL.md')
      if (guide === undefined) {
        placements.push({
          agentKey,
          directory,
          skillFilePath,
          outcome: 'error',
          detail: `No bundled skill named "${skill}".`
        })
        continue
      }
      try {
        const existing = await readExistingSkillFile(skillFilePath)
        if (existing === guide.markdown) {
          placements.push({
            agentKey,
            directory,
            skillFilePath,
            outcome: 'already-current'
          })
          continue
        }
        if (input.mode === 'install' && existing !== null) {
          placements.push({
            agentKey,
            directory,
            skillFilePath,
            outcome: 'conflict',
            detail: 'An existing SKILL.md differs from the bundled copy.'
          })
          continue
        }
        if (input.mode === 'update' && existing === null) {
          placements.push({
            agentKey,
            directory,
            skillFilePath,
            outcome: 'not-installed'
          })
          continue
        }
        if (input.dryRun === true) {
          placements.push({
            agentKey,
            directory,
            skillFilePath,
            outcome: 'written',
            detail: 'Dry run: no files were written.'
          })
          continue
        }
        await mkdir(dirname(skillFilePath), { recursive: true })
        await writeFile(skillFilePath, guide.markdown, 'utf8')
        placements.push({
          agentKey,
          directory,
          skillFilePath,
          outcome: 'written'
        })
      } catch (error) {
        placements.push({
          agentKey,
          directory,
          skillFilePath,
          outcome: 'error',
          detail: error instanceof Error ? error.message : String(error)
        })
      }
    }
    outcomes.push({ skill, placements })
  }
  return { outcomes }
}

/**
 * Health-check used by onboarding and Settings: reports which bundled skills
 * are present in any known agent home and whether every copy matches the
 * bundled markdown (`stale` when at least one copy drifted).
 */
export async function getBundledSkillsLocalStatus(input: {
  guides: readonly BundledSkillGuideSource[]
  homeDir?: string
}): Promise<BundledSkillStatus> {
  const homeDir = input.homeDir ?? homedir()
  const entries: BundledSkillStatusEntry[] = []
  for (const guide of input.guides) {
    const installedDirectories: string[] = []
    let anyStale = false
    for (const relativeDir of Object.values(BUNDLED_SKILL_AGENT_HOME_DIRS)) {
      const skillFilePath = join(homeDir, relativeDir, guide.name, 'SKILL.md')
      let existing: string | null
      try {
        existing = await readExistingSkillFile(skillFilePath)
      } catch {
        anyStale = true
        continue
      }
      if (existing === null) {
        continue
      }
      installedDirectories.push(join(homeDir, relativeDir))
      if (existing !== guide.markdown) {
        anyStale = true
      }
    }
    entries.push({
      skill: guide.name,
      installedDirectories,
      state: installedDirectories.length === 0 ? 'not-installed' : anyStale ? 'stale' : 'current'
    })
  }
  return { skills: entries }
}

export function summarizeBundledSkillPlacements(outcome: BundledSkillPlacementOutcome): string {
  switch (outcome) {
    case 'written':
      return 'installed'
    case 'already-current':
      return 'already current'
    case 'conflict':
      return 'skipped (existing copy differs)'
    case 'not-installed':
      return 'not installed'
    case 'unsupported-agent':
      return 'unsupported agent'
    case 'error':
      return 'failed'
  }
}
