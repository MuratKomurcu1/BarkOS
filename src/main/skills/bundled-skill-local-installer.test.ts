import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  getBundledSkillsLocalStatus,
  installBundledSkillsLocally
} from './bundled-skill-local-installer'

const GUIDES = [
  { name: 'barkos-cli', markdown: '# barkos-cli\n\nInstall guide.\n' },
  { name: 'orchestration', markdown: '# orchestration\n\nSwarm guide.\n' }
]

async function createHomeDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'barkos-bundled-skills-'))
}

describe('installBundledSkillsLocally', () => {
  it('writes a missing skill into the requested agent home', async () => {
    const home = await createHomeDir()
    const result = await installBundledSkillsLocally({
      skills: ['barkos-cli'],
      agents: ['claude-code'],
      mode: 'install',
      guides: GUIDES,
      homeDir: home
    })
    expect(result.outcomes).toHaveLength(1)
    expect(result.outcomes[0].placements[0].outcome).toBe('written')
    const written = await readFile(join(home, '.claude/skills/barkos-cli/SKILL.md'), 'utf8')
    expect(written).toBe(GUIDES[0].markdown)
  })

  it('reports already-current when the copy matches the bundle', async () => {
    const home = await createHomeDir()
    await installBundledSkillsLocally({
      skills: ['barkos-cli'],
      agents: ['codex'],
      mode: 'install',
      guides: GUIDES,
      homeDir: home
    })
    const again = await installBundledSkillsLocally({
      skills: ['barkos-cli'],
      agents: ['codex'],
      mode: 'install',
      guides: GUIDES,
      homeDir: home
    })
    expect(again.outcomes[0].placements[0].outcome).toBe('already-current')
  })

  it('never clobbers a differing file in install mode', async () => {
    const home = await createHomeDir()
    const target = join(home, '.codex/skills/barkos-cli/SKILL.md')
    await mkdir(join(home, '.codex/skills/barkos-cli'), { recursive: true })
    await writeFile(target, 'user customized\n')
    const result = await installBundledSkillsLocally({
      skills: ['barkos-cli'],
      agents: ['codex'],
      mode: 'install',
      guides: GUIDES,
      homeDir: home
    })
    expect(result.outcomes[0].placements[0].outcome).toBe('conflict')
    expect(await readFile(target, 'utf8')).toBe('user customized\n')
  })

  it('overwrites a differing file in update mode', async () => {
    const home = await createHomeDir()
    const target = join(home, '.cursor/skills/barkos-cli/SKILL.md')
    await mkdir(join(home, '.cursor/skills/barkos-cli'), { recursive: true })
    await writeFile(target, 'stale\n')
    const result = await installBundledSkillsLocally({
      skills: ['barkos-cli'],
      agents: ['cursor'],
      mode: 'update',
      guides: GUIDES,
      homeDir: home
    })
    expect(result.outcomes[0].placements[0].outcome).toBe('written')
    expect(await readFile(target, 'utf8')).toBe(GUIDES[0].markdown)
  })

  it('reports not-installed for update of a missing skill', async () => {
    const home = await createHomeDir()
    const result = await installBundledSkillsLocally({
      skills: ['orchestration'],
      agents: ['universal'],
      mode: 'update',
      guides: GUIDES,
      homeDir: home
    })
    expect(result.outcomes[0].placements[0].outcome).toBe('not-installed')
  })

  it('marks unknown agent keys as unsupported without writing anywhere', async () => {
    const home = await createHomeDir()
    const result = await installBundledSkillsLocally({
      skills: ['barkos-cli'],
      agents: ['not-an-agent'],
      mode: 'install',
      guides: GUIDES,
      homeDir: home
    })
    expect(result.outcomes[0].placements[0].outcome).toBe('unsupported-agent')
  })

  it('resolves aliases case-insensitively and reports unknown skills as errors', async () => {
    const home = await createHomeDir()
    const known = await installBundledSkillsLocally({
      skills: ['ORCA-CLI'],
      agents: ['grok'],
      mode: 'install',
      guides: GUIDES,
      homeDir: home
    })
    expect(known.outcomes[0].placements[0].outcome).toBe('written')
    expect(known.outcomes[0].placements[0].skillFilePath).toContain('barkos-cli')

    const unknown = await installBundledSkillsLocally({
      skills: ['nope'],
      agents: ['grok'],
      mode: 'install',
      guides: GUIDES,
      homeDir: home
    })
    expect(unknown.outcomes[0].placements[0].outcome).toBe('error')
  })

  it('dry run reports would-be writes without touching the disk', async () => {
    const home = await createHomeDir()
    const result = await installBundledSkillsLocally({
      skills: ['barkos-cli'],
      agents: ['pi'],
      mode: 'install',
      guides: GUIDES,
      homeDir: home,
      dryRun: true
    })
    expect(result.outcomes[0].placements[0].outcome).toBe('written')
    await expect(
      readFile(join(home, '.pi/agent/skills/barkos-cli/SKILL.md'), 'utf8')
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('getBundledSkillsLocalStatus', () => {
  it('reports not-installed when no agent home has the skill', async () => {
    const home = await createHomeDir()
    const status = await getBundledSkillsLocalStatus({ guides: GUIDES, homeDir: home })
    expect(status.skills.map((entry) => entry.state)).toEqual(['not-installed', 'not-installed'])
  })

  it('reports current after a matching install', async () => {
    const home = await createHomeDir()
    await installBundledSkillsLocally({
      skills: ['barkos-cli'],
      agents: ['droid'],
      mode: 'install',
      guides: GUIDES,
      homeDir: home
    })
    const status = await getBundledSkillsLocalStatus({ guides: GUIDES, homeDir: home })
    expect(status.skills[0]).toMatchObject({
      skill: 'barkos-cli',
      state: 'current',
      installedDirectories: [join(home, '.factory/skills')]
    })
    expect(status.skills[1].state).toBe('not-installed')
  })

  it('reports stale when an installed copy drifted from the bundle', async () => {
    const home = await createHomeDir()
    const dir = join(home, '.continue/skills/barkos-cli')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), 'drifted\n')
    const status = await getBundledSkillsLocalStatus({ guides: GUIDES, homeDir: home })
    expect(status.skills[0].state).toBe('stale')
  })
})
