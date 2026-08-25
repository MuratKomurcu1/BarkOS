import { describe, expect, it } from 'vitest'
import {
  buildAgentFeatureSkillInstallArgs,
  buildAgentFeatureSkillInstallCommand,
  ORCA_CLI_SKILL_INSTALL_COMMAND,
  buildAgentFeatureSkillUpdateArgs,
  buildAgentFeatureSkillUpdateCommand,
  COMPUTER_USE_SKILL_UPDATE_COMMAND,
  EPHEMERAL_VMS_SKILL_UPDATE_COMMAND,
  LINEAR_TICKETS_SKILL_UPDATE_COMMAND,
  ORCA_LINEAR_SKILL_UPDATE_COMMAND,
  ORCA_CLI_ORCHESTRATION_SKILL_INSTALL_COMMAND,
  ORCA_CLI_SKILL_UPDATE_COMMAND,
  ORCHESTRATION_SKILL_UPDATE_COMMAND
} from './agent-feature-install-commands'

describe('agent feature skill commands', () => {
  it('builds a global install command against the local BarkOS CLI', () => {
    expect(buildAgentFeatureSkillInstallCommand(['barkos-cli'])).toBe(
      'barkos skills install --skill barkos-cli --global'
    )
    expect(buildAgentFeatureSkillInstallCommand(['barkos-cli'])).not.toContain('npx')
    expect(buildAgentFeatureSkillInstallCommand(['barkos-cli'])).not.toContain('github.com')
  })

  it('drops --global when installing locally', () => {
    expect(buildAgentFeatureSkillInstallCommand(['barkos-cli'], { global: false })).toBe(
      'barkos skills install --skill barkos-cli'
    )
  })

  it('repeats --skill per name for multi-skill installs', () => {
    expect(buildAgentFeatureSkillInstallCommand(['barkos-cli', 'orchestration'])).toBe(
      'barkos skills install --skill barkos-cli --skill orchestration --global'
    )
    expect(buildAgentFeatureSkillInstallArgs(['barkos-cli', 'orchestration'])).toEqual([
      'skills',
      'install',
      '--skill',
      'barkos-cli',
      '--skill',
      'orchestration',
      '--global'
    ])
  })

  it('scopes explicit agent targets into one comma-joined flag', () => {
    expect(
      buildAgentFeatureSkillInstallCommand(['barkos-cli'], { agents: ['universal', 'claude-code'] })
    ).toBe('barkos skills install --skill barkos-cli --global --agent universal,claude-code')
  })

  it('refuses a target the installer would drop', () => {
    // Why: defence in depth — a `-`-leading value historically meant "all agents"
    // to the external skills CLI; the local installer never widens targets.
    expect(() => buildAgentFeatureSkillInstallCommand(['barkos-cli'], { agents: ['-y'] })).toThrow(
      '"-y" is not a usable install target.'
    )
    expect(() =>
      buildAgentFeatureSkillInstallArgs(['barkos-cli'], { agents: ['universal', 'a b'] })
    ).toThrow('"a b" is not a usable install target.')
  })

  it('builds single-skill update commands', () => {
    expect(buildAgentFeatureSkillUpdateCommand('orchestration')).toBe(
      'barkos skills update --skill orchestration --global'
    )
  })

  it('trims and rejects blank update skill names', () => {
    expect(buildAgentFeatureSkillUpdateCommand('  barkos-cli  ')).toBe(
      'barkos skills update --skill barkos-cli --global'
    )
    expect(() => buildAgentFeatureSkillUpdateCommand('   ')).toThrow('A skill name is required.')
  })

  it('builds multi-skill update commands and selects project scope for --local', () => {
    expect(buildAgentFeatureSkillUpdateCommand(['barkos-cli', 'orchestration'])).toBe(
      'barkos skills update --skill barkos-cli --skill orchestration --global'
    )
    expect(buildAgentFeatureSkillUpdateCommand(['barkos-cli'], { global: false })).toBe(
      'barkos skills update --skill barkos-cli --project'
    )
    expect(buildAgentFeatureSkillUpdateArgs(['barkos-cli'], { global: false })).toEqual([
      'skills',
      'update',
      '--skill',
      'barkos-cli',
      '--project'
    ])
    expect(() => buildAgentFeatureSkillUpdateCommand([])).toThrow('A skill name is required.')
  })

  it('exports single-skill update constants without changing install bundles', () => {
    expect(ORCA_CLI_SKILL_INSTALL_COMMAND).toBe('barkos skills install --skill barkos-cli --global')
    expect(ORCA_CLI_SKILL_UPDATE_COMMAND).toBe('barkos skills update --skill barkos-cli --global')
    expect(COMPUTER_USE_SKILL_UPDATE_COMMAND).toBe(
      'barkos skills update --skill computer-use --global'
    )
    expect(ORCHESTRATION_SKILL_UPDATE_COMMAND).toBe(
      'barkos skills update --skill orchestration --global'
    )
    expect(EPHEMERAL_VMS_SKILL_UPDATE_COMMAND).toBe(
      'barkos skills update --skill barkos-per-workspace-env --global'
    )
    expect(ORCA_LINEAR_SKILL_UPDATE_COMMAND).toBe(
      'barkos skills update --skill barkos-linear --global'
    )
    expect(LINEAR_TICKETS_SKILL_UPDATE_COMMAND).toBe(
      'barkos skills update --skill linear-tickets --global'
    )
    expect(ORCA_CLI_ORCHESTRATION_SKILL_INSTALL_COMMAND).toBe(
      buildAgentFeatureSkillInstallCommand(['barkos-cli', 'orchestration'])
    )
  })
})
