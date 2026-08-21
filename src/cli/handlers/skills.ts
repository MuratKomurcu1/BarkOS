import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime-client'
import { getRepeatedStringFlag } from '../flags'
import { detectCommandsInInstallDirs } from '../../shared/local-agent-install-dir-detection'
import {
  getTuiAgentDetectionProbeCommands,
  KNOWN_TUI_AGENT_DETECTION_COMMANDS,
  resolveDetectedTuiAgentIds
} from '../../shared/tui-agent-detection-commands'
import { isSkillsCliAgentKeyShaped, toSkillsCliAgentKeys } from '../../shared/skills-cli-agent-keys'
import { BUNDLED_SKILL_AGENT_HOME_DIRS } from '../../shared/bundled-skill-local-install'
import {
  installBundledSkillsLocally,
  summarizeBundledSkillPlacements
} from '../../main/skills/bundled-skill-local-installer'

type BundledSkillGuide = {
  name: string
  description: string
  markdown: string
  fullMarkdown: string
  aliases: readonly string[]
}

function canonicalGuides(guides: readonly BundledSkillGuide[]): BundledSkillGuide[] {
  return [...guides].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0
  )
}

function requireTopic(
  flags: Map<string, string | boolean>,
  guides: BundledSkillGuide[]
): BundledSkillGuide {
  const availableTopics = guides.map((guide) => guide.name).join(', ')
  const topic = flags.get('topic')
  if (typeof topic !== 'string' || topic.length === 0) {
    throw new RuntimeClientError(
      'invalid_argument',
      `Missing skill topic. Available topics: ${availableTopics}`
    )
  }
  // Why: installed stubs may retain an old topic forever, so aliases and canonical
  // names share one lookup table instead of being treated as transient CLI aliases.
  const guideByTopic = new Map<string, BundledSkillGuide>(
    guides.flatMap((guide) => [guide.name, ...guide.aliases].map((name) => [name, guide]))
  )
  const guide = guideByTopic.get(topic)
  if (!guide) {
    throw new RuntimeClientError(
      'invalid_argument',
      `Unknown skill topic "${topic}". Available topics: ${availableTopics}`
    )
  }
  return guide
}

function writeStdout(value: string): void {
  process.stdout.write(value.endsWith('\n') ? value : `${value}\n`)
}

function resolveSelectedSkillNames(
  flags: Map<string, string | boolean>,
  guides: BundledSkillGuide[]
): string[] {
  const requestedSkills = getRepeatedStringFlag(flags, 'skill')
  const selectAll = flags.get('all') === true
  if (flags.has('skill') && requestedSkills.length === 0) {
    throw new RuntimeClientError('invalid_argument', 'Missing required --skill')
  }
  if (selectAll && requestedSkills.length > 0) {
    throw new RuntimeClientError('invalid_argument', 'Use either --all or --skill, not both.')
  }
  if (!selectAll && requestedSkills.length === 0) {
    return []
  }
  if (selectAll) {
    return guides.map((guide) => guide.name)
  }
  const availableTopics = guides.map((guide) => guide.name).join(', ')
  const guideByTopic = new Map<string, BundledSkillGuide>(
    guides.flatMap((guide) => [guide.name, ...guide.aliases].map((name) => [name, guide]))
  )
  const canonicalNames = new Set<string>()
  for (const requested of requestedSkills) {
    const guide = guideByTopic.get(requested)
    if (!guide) {
      throw new RuntimeClientError(
        'invalid_argument',
        `Unknown skill "${requested}". Available skills: ${availableTopics}`
      )
    }
    canonicalNames.add(guide.name)
  }
  return [...canonicalNames].sort()
}

type SkillMutationVerb = 'install' | 'update'

/** Agents BarkOS can see on this host, as local installer agent keys. */
function detectSkillsCliAgentKeys(): string[] {
  const runtime = process.platform
  const probes = getTuiAgentDetectionProbeCommands(KNOWN_TUI_AGENT_DETECTION_COMMANDS, runtime)
  const detected = resolveDetectedTuiAgentIds(
    KNOWN_TUI_AGENT_DETECTION_COMMANDS,
    detectCommandsInInstallDirs(probes),
    runtime
  )
  return detected.length === 0 ? [] : toSkillsCliAgentKeys(detected)
}

function resolveInstallAgentKeys(flags: Map<string, string | boolean>): string[] {
  const requested = flags.get('agent')
  if (flags.has('agent') && typeof requested !== 'string') {
    throw new RuntimeClientError('invalid_argument', 'Missing required --agent')
  }
  if (typeof requested === 'string') {
    // Why: one comma-separated value rather than a repeatable flag — `agent` is a
    // single-value flag on other commands and the repeatable set is process-wide,
    // so making it repeatable here would change how those parse a second --agent.
    const keys = [
      ...new Set(
        requested
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      )
    ]
    // Why: a value like "," parses to nothing. Falling through to detection would
    // be surprising, and emitting no --agent would widen the install silently.
    if (keys.length === 0) {
      throw new RuntimeClientError('invalid_argument', 'Missing required --agent')
    }
    const unusable = keys.find((key) => !isSkillsCliAgentKeyShaped(key))
    if (unusable !== undefined) {
      throw new RuntimeClientError(
        'invalid_argument',
        `Invalid --agent value "${unusable}". Pass agent names such as claude-code, ` +
          'codex, or universal.'
      )
    }
    return keys
  }
  const detected = detectSkillsCliAgentKeys()
  if (detected.length > 0) {
    return detected
  }
  throw new RuntimeClientError(
    'invalid_environment',
    'No coding agent detected on this host, so there is no install target. Pass ' +
      '--agent <name>[,<name>...] to choose targets explicitly — --agent universal ' +
      'writes only the shared .agents/skills directory that BarkOS reads.'
  )
}

function formatSkillSelectionHelp(verb: SkillMutationVerb, skillNames: string[]): string {
  return [
    `Choose one or more skills to ${verb}:`,
    ...skillNames.map((name) => `  ${name}`),
    '',
    `Usage: barkos skills ${verb} --skill <name> [--skill <name> ...]`,
    `   or: barkos skills ${verb} --all`
  ].join('\n')
}

function formatPlacementLines(
  result: Awaited<ReturnType<typeof installBundledSkillsLocally>>
): string[] {
  const lines: string[] = []
  for (const outcome of result.outcomes) {
    lines.push(`${outcome.skill}:`)
    for (const placement of outcome.placements) {
      const summary = summarizeBundledSkillPlacements(placement.outcome)
      if (placement.skillFilePath) {
        lines.push(`  ${placement.agentKey} -> ${placement.skillFilePath} (${summary})`)
      } else {
        lines.push(`  ${placement.agentKey} (${summary})`)
      }
      if (placement.detail) {
        lines.push(`    ${placement.detail}`)
      }
    }
  }
  return lines
}

function resultHasBlockingFailure(
  verb: SkillMutationVerb,
  result: Awaited<ReturnType<typeof installBundledSkillsLocally>>
): boolean {
  return result.outcomes.some((outcome) =>
    outcome.placements.some(
      (placement) =>
        placement.outcome === 'error' || (verb === 'install' && placement.outcome === 'conflict')
    )
  )
}

function createSkillMutationHandler(verb: SkillMutationVerb): CommandHandler {
  return async ({ flags, json, cwd }) => {
    // Why: keep the large generated table off the eager handler registry path.
    const { BUNDLED_SKILL_GUIDES } = await import('../../shared/bundled-skill-guides.js')
    const guides = canonicalGuides(BUNDLED_SKILL_GUIDES)
    const skillNames = resolveSelectedSkillNames(flags, guides)

    if (skillNames.length === 0) {
      const names = guides.map((guide) => guide.name)
      writeStdout(
        json
          ? JSON.stringify({ availableSkills: names }, null, 2)
          : formatSkillSelectionHelp(verb, names)
      )
      return
    }

    // Why: this runs before target resolution because the answer belongs to the
    // other machine — agents detected here would be the wrong host's, and a host
    // that detects none would hide the forwarding problem behind that error.
    if (process.env.ORCA_CLI_CWD) {
      throw new RuntimeClientError(
        'invalid_environment',
        `barkos skills ${verb} writes to the machine that runs it, but this shell forwards ` +
          `barkos to the BarkOS host. Run the same barkos skills ${verb} command on the machine ` +
          "you want it on, where it can detect that host's agents."
      )
    }

    const global = flags.get('local') !== true
    // Why: install scopes its targets; update refreshes whatever is already
    // placed in any known agent home, so it never picks targets.
    const agents =
      verb === 'install'
        ? resolveInstallAgentKeys(flags)
        : Object.keys(BUNDLED_SKILL_AGENT_HOME_DIRS)
    const dryRun = flags.get('dry-run') === true

    const result = await installBundledSkillsLocally({
      skills: skillNames,
      agents,
      mode: verb,
      guides,
      dryRun,
      ...(global ? {} : { projectDir: cwd })
    })

    if (json) {
      writeStdout(
        JSON.stringify(
          {
            verb,
            global,
            dryRun,
            outcomes: result.outcomes
          },
          null,
          2
        )
      )
    } else {
      writeStdout(formatPlacementLines(result).join('\n'))
      if (dryRun) {
        writeStdout('\nDry run: no files were written.')
      }
    }

    if (resultHasBlockingFailure(verb, result)) {
      process.exitCode = 1
    }
  }
}

export const SKILL_HANDLERS: Record<string, CommandHandler> = {
  'skills list': async ({ json }) => {
    // Why: the embedded guide table is large, so unrelated CLI commands must not
    // pay its module-load and parse cost during startup.
    const { BUNDLED_SKILL_GUIDES } = await import('../../shared/bundled-skill-guides.js')
    const guides = canonicalGuides(BUNDLED_SKILL_GUIDES)
    // Why: generated registry order is not a user-facing contract, while stable
    // canonical sorting keeps agent-visible output reproducible across builds.
    const topics = guides.map((guide) => ({
      name: guide.name,
      description: guide.description.replace(/\s+/g, ' ').trim()
    }))
    writeStdout(
      json
        ? JSON.stringify({ topics }, null, 2)
        : topics.map((topic) => `${topic.name}: ${topic.description}`).join('\n')
    )
  },
  'skills get': async ({ flags, json }) => {
    // Why: keep the large generated table off the eager handler registry path.
    const { BUNDLED_SKILL_GUIDES } = await import('../../shared/bundled-skill-guides.js')
    const guides = canonicalGuides(BUNDLED_SKILL_GUIDES)
    const guide = requireTopic(flags, guides)
    const full = flags.has('full')
    const markdown = full ? guide.fullMarkdown : guide.markdown
    writeStdout(json ? JSON.stringify({ name: guide.name, full, markdown }, null, 2) : markdown)
  },
  'skills install': createSkillMutationHandler('install'),
  'skills update': createSkillMutationHandler('update')
}
