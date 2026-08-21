import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { detectCommandsMock, guideModuleLoadMock, runtimeClientConstructorMock } = vi.hoisted(
  () => ({
    detectCommandsMock: vi.fn(() => new Set<string>(['claude'])),
    guideModuleLoadMock: vi.fn(),
    runtimeClientConstructorMock: vi.fn()
  })
)

// Why: agent detection probes the real machine, so pin it or every install
// assertion depends on what the test runner happens to have installed.
vi.mock('../shared/local-agent-install-dir-detection', () => ({
  detectCommandsInInstallDirs: detectCommandsMock
}))

vi.mock('../shared/bundled-skill-guides.js', () => {
  guideModuleLoadMock()
  return {
    BUNDLED_SKILL_GUIDES: [
      {
        name: 'zeta',
        description: 'Use when zeta work\nspans lines.',
        markdown: '# Zeta\n',
        fullMarkdown: '# Zeta\n\n## References\n\nZeta reference.\n',
        aliases: []
      },
      {
        name: 'alpha',
        description: 'Use when alpha work is needed.',
        markdown: '# Alpha\n\nShort.\n',
        fullMarkdown: '# Alpha\n\nShort.\n\n## References\n\nFull.\n',
        aliases: ['legacy-alpha']
      },
      {
        name: 'gamma',
        description:
          'Use when gamma work spans several sentences describing exactly how a ' +
          'coding agent should decide whether gamma applies to the current task at hand.',
        markdown: '# Gamma\n',
        fullMarkdown: '# Gamma\n\n## References\n\nGamma reference.\n',
        aliases: []
      }
    ]
  }
})

vi.mock('./runtime-client', async () => {
  // Why: re-export the REAL error classes rather than redefining them. format.ts
  // narrows with `instanceof` against ./runtime/types, so a look-alike class
  // here would make every CLI error fall through to the generic `runtime_error`
  // shape — mirroring the barrel keeps the mock faithful to production.
  const { RuntimeClientError, RuntimeRpcFailureError } = await import('./runtime/types.js')

  class RuntimeClient {
    constructor() {
      runtimeClientConstructorMock()
    }
  }

  return {
    RuntimeClient,
    RuntimeClientError,
    RuntimeRpcFailureError,
    serveOrcaApp: vi.fn(),
    getDefaultUserDataPath: vi.fn(() => '/tmp/orca-user-data')
  }
})

import { dispatch } from './dispatch'
import { main } from './index'

describe('orca skills CLI', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    runtimeClientConstructorMock.mockClear()
    detectCommandsMock.mockReset()
    detectCommandsMock.mockReturnValue(new Set<string>(['claude']))
    process.exitCode = undefined
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('keeps the bundled table off the eager command-registry path', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(guideModuleLoadMock).not.toHaveBeenCalled()
    await main(['status', '--help'], '/tmp/repo')
    expect(guideModuleLoadMock).not.toHaveBeenCalled()
  })

  it('dispatches an alias locally and emits the exact Markdown', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await dispatch(['skills', 'get'], {
      flags: new Map([['topic', 'legacy-alpha']]),
      get client(): never {
        throw new Error('skills get accessed RuntimeClient')
      },
      cwd: '/tmp/repo',
      json: false
    })

    expect(stdoutText(stdoutSpy)).toBe('# Alpha\n\nShort.\n')
  })

  it('lists canonical topics deterministically without constructing RuntimeClient', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'list'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe(
      'alpha: Use when alpha work is needed.\n' +
        'gamma: Use when gamma work spans several sentences describing exactly how a ' +
        'coding agent should decide whether gamma applies to the current task at hand.\n' +
        'zeta: Use when zeta work spans lines.\n'
    )
    expect(runtimeClientConstructorMock).not.toHaveBeenCalled()
  })

  it('emits full Markdown for --full', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'get', 'alpha', '--full'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe('# Alpha\n\nShort.\n\n## References\n\nFull.\n')
  })

  it('supports the canonical single-item show verb as an alias', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'show', 'alpha'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe('# Alpha\n\nShort.\n')
  })

  it('gives list --json a stable canonical schema', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'list', '--json'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe(
      `${JSON.stringify(
        {
          topics: [
            { name: 'alpha', description: 'Use when alpha work is needed.' },
            {
              name: 'gamma',
              description:
                'Use when gamma work spans several sentences describing exactly how a ' +
                'coding agent should decide whether gamma applies to the current task at hand.'
            },
            { name: 'zeta', description: 'Use when zeta work spans lines.' }
          ]
        },
        null,
        2
      )}\n`
    )
  })

  it('gives alias get --json the canonical name, selection, and Markdown', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'get', 'legacy-alpha', '--full', '--json'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe(
      `${JSON.stringify(
        {
          name: 'alpha',
          full: true,
          markdown: '# Alpha\n\nShort.\n\n## References\n\nFull.\n'
        },
        null,
        2
      )}\n`
    )
  })

  it('shows leaf, group, and root help for skills', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(['skills', 'get', '--help'], '/tmp/repo')
    await main(['skills', '--help'], '/tmp/repo')
    await main(['--help'], '/tmp/repo')

    expect(String(logSpy.mock.calls[0]?.[0])).toContain(
      'Usage: barkos skills get <topic> [--full] [--json]'
    )
    expect(String(logSpy.mock.calls[1]?.[0])).toContain(
      'Commands:\n  installed          List installed skill selectors'
    )
    expect(String(logSpy.mock.calls[1]?.[0])).toContain(
      'get                Print a version-matched skill guide'
    )
    expect(String(logSpy.mock.calls[1]?.[0])).toContain(
      'install            Install bundled BarkOS skills'
    )
    expect(String(logSpy.mock.calls[1]?.[0])).toContain(
      'update             Refresh already-installed BarkOS skills from the bundled registry'
    )
    expect(String(logSpy.mock.calls[2]?.[0])).toContain('Skills:\n  skills installed')
    expect(String(logSpy.mock.calls[2]?.[0])).toContain('skills update')
    expect(runtimeClientConstructorMock).not.toHaveBeenCalled()
  })

  it('returns a nonzero error with all canonical topics for an unknown topic', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(['skills', 'get', 'missing'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(
      'Unknown skill topic "missing". Available topics: alpha, gamma, zeta'
    )
    expect(runtimeClientConstructorMock).not.toHaveBeenCalled()
  })

  it('lists installable skills when no --skill/--all is given', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe(
      [
        'Choose one or more skills to install:',
        '  alpha',
        '  gamma',
        '  zeta',
        '',
        'Usage: barkos skills install --skill <name> [--skill <name> ...]',
        '   or: barkos skills install --all',
        ''
      ].join('\n')
    )
    expect(runtimeClientConstructorMock).not.toHaveBeenCalled()
  })

  it('gives install --json (no selection) a stable schema', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--json'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe(
      `${JSON.stringify({ availableSkills: ['alpha', 'gamma', 'zeta'] }, null, 2)}\n`
    )
  })

  it('rejects combining --all with --skill', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(['skills', 'install', '--all', '--skill', 'alpha'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith('Use either --all or --skill, not both.')
  })

  it('rejects an unknown --skill name', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(['skills', 'install', '--skill', 'missing'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(
      'Unknown skill "missing". Available skills: alpha, gamma, zeta'
    )
  })

  it('rejects --skill without a value', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(['skills', 'install', '--skill'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith('Missing required --skill')
  })

  it('installs bundled markdown into detected agent homes without any network', async () => {
    const home = await createHomeDir()
    vi.stubEnv('HOME', home)
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--skill', 'alpha'], '/tmp/repo')

    // Why: detection returns `claude`, which maps to claude-code plus the
    // shared universal home; both must receive the exact bundled markdown.
    expect(await readFile(join(home, '.claude/skills/alpha/SKILL.md'), 'utf8')).toBe(
      '# Alpha\n\nShort.\n'
    )
    expect(await readFile(join(home, '.agents/skills/alpha/SKILL.md'), 'utf8')).toBe(
      '# Alpha\n\nShort.\n'
    )
    expect(stdoutText(stdoutSpy)).toContain('alpha:')
    expect(stdoutText(stdoutSpy)).toContain('(installed)')
    expect(process.exitCode).toBeUndefined()
  })

  it('resolves a legacy topic alias to the canonical skill directory', async () => {
    const home = await createHomeDir()
    vi.stubEnv('HOME', home)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--skill', 'legacy-alpha'], '/tmp/repo')

    expect(await readFile(join(home, '.claude/skills/alpha/SKILL.md'), 'utf8')).toBe(
      '# Alpha\n\nShort.\n'
    )
  })

  it('accumulates a repeated --skill instead of keeping only the last one', async () => {
    const home = await createHomeDir()
    vi.stubEnv('HOME', home)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--skill', 'zeta', '--skill', 'alpha'], '/tmp/repo')

    // Why: the documented primary invocation. Dropping 'skill' from the
    // repeatable-flag set silently installs one skill instead of two.
    expect(await readFile(join(home, '.claude/skills/zeta/SKILL.md'), 'utf8')).toBe('# Zeta\n')
    expect(await readFile(join(home, '.claude/skills/alpha/SKILL.md'), 'utf8')).toBe(
      '# Alpha\n\nShort.\n'
    )
  })

  it('installs every skill for --all', async () => {
    const home = await createHomeDir()
    vi.stubEnv('HOME', home)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--all'], '/tmp/repo')

    for (const name of ['alpha', 'gamma', 'zeta']) {
      expect(await readFile(join(home, '.agents/skills', name, 'SKILL.md'), 'utf8')).toBeTruthy()
    }
  })

  it('honours an explicit --agent list without probing the host', async () => {
    const home = await createHomeDir()
    vi.stubEnv('HOME', home)
    detectCommandsMock.mockReturnValue(new Set<string>())
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(
      ['skills', 'install', '--skill', 'alpha', '--agent', 'codex, claude-code ,codex'],
      '/tmp/repo'
    )

    // Why: trimmed and de-duplicated, and detection is not consulted at all.
    expect(detectCommandsMock).not.toHaveBeenCalled()
    expect(await readFile(join(home, '.codex/skills/alpha/SKILL.md'), 'utf8')).toBe(
      '# Alpha\n\nShort.\n'
    )
    expect(await readFile(join(home, '.claude/skills/alpha/SKILL.md'), 'utf8')).toBe(
      '# Alpha\n\nShort.\n'
    )
    await expect(
      readFile(join(home, '.agents/skills/alpha/SKILL.md'), 'utf8')
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('scopes --local to the project-shared .agents/skills directory', async () => {
    const home = await createHomeDir()
    vi.stubEnv('HOME', home)
    const project = await mkdtemp(join(tmpdir(), 'barkos-project-'))
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--skill', 'alpha', '--local'], project)

    expect(await readFile(join(project, '.agents/skills/alpha/SKILL.md'), 'utf8')).toBe(
      '# Alpha\n\nShort.\n'
    )
    await expect(
      readFile(join(home, '.claude/skills/alpha/SKILL.md'), 'utf8')
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await rm(project, { recursive: true, force: true })
  })

  it('never clobbers a differing existing copy and exits nonzero', async () => {
    const home = await createHomeDir()
    vi.stubEnv('HOME', home)
    const target = join(home, '.claude/skills/alpha/SKILL.md')
    await mkdir(join(home, '.claude/skills/alpha'), { recursive: true })
    await writeFile(target, 'user customized\n')
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--skill', 'alpha'], '/tmp/repo')

    expect(await readFile(target, 'utf8')).toBe('user customized\n')
    expect(stdoutText(stdoutSpy)).toContain('(skipped (existing copy differs))')
    expect(process.exitCode).toBe(1)
  })

  it('reports already-current when the copy matches the bundle', async () => {
    const home = await createHomeDir()
    vi.stubEnv('HOME', home)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await main(['skills', 'install', '--skill', 'alpha'], '/tmp/repo')
    process.exitCode = undefined
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--skill', 'alpha'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toContain('(already current)')
    expect(process.exitCode).toBeUndefined()
  })

  it('prints planned paths without writing anything for --dry-run', async () => {
    const home = await createHomeDir()
    vi.stubEnv('HOME', home)
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--skill', 'alpha', '--dry-run'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toContain('.claude/skills/alpha/SKILL.md')
    expect(stdoutText(stdoutSpy)).toContain('Dry run: no files were written.')
    await expect(
      readFile(join(home, '.claude/skills/alpha/SKILL.md'), 'utf8')
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('gives a real install --json a stable outcome schema', async () => {
    const home = await createHomeDir()
    vi.stubEnv('HOME', home)
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--skill', 'legacy-alpha', '--json'], '/tmp/repo')

    const payload = JSON.parse(stdoutText(stdoutSpy)) as {
      verb: string
      global: boolean
      dryRun: boolean
      executed: boolean
      outcomes: {
        skill: string
        placements: { agentKey: string; outcome: string }[]
      }[]
    }
    expect(payload.verb).toBe('install')
    expect(payload.global).toBe(true)
    expect(payload.dryRun).toBe(false)
    expect(payload.executed).toBe(true)
    expect(payload.outcomes).toHaveLength(1)
    expect(payload.outcomes[0].skill).toBe('alpha')
    expect(payload.outcomes[0].placements.map((placement) => placement.agentKey).sort()).toEqual([
      'claude-code',
      'universal'
    ])
    expect(payload.outcomes[0].placements.every((p) => p.outcome === 'written')).toBe(true)
  })

  it('refuses to install when no agent is detected, instead of targeting them all', async () => {
    detectCommandsMock.mockReturnValue(new Set<string>())
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(['skills', 'install', '--skill', 'alpha'], '/tmp/repo')

    // Why: an empty target set would either write nothing or widen to every
    // known agent home. Say so instead of guessing.
    expect(process.exitCode).toBe(1)
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('No coding agent detected')
  })

  it.each([
    ['a bare --agent', ['skills', 'install', '--skill', 'alpha', '--agent']],
    ['an empty --agent', ['skills', 'install', '--skill', 'alpha', '--agent', '']],
    ['a separator-only --agent', ['skills', 'install', '--skill', 'alpha', '--agent', ' , ,']]
  ])('rejects %s instead of installing to every agent', async (_label, argv) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(argv, '/tmp/repo')

    // Why: an --agent that resolves to nothing must not fall back to detection or
    // emit no --agent at all — the latter would widen the install.
    expect(process.exitCode).toBe(1)
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('Missing required --agent')
  })

  it.each([
    ['a dash-leading value', ['skills', 'install', '--skill', 'alpha', '--agent', '-y']],
    ['an inline dash value', ['skills', 'install', '--skill', 'alpha', '--agent=--copy']],
    ['a value with a space', ['skills', 'install', '--skill', 'alpha', '--agent', 'a b']]
  ])('rejects %s that would silently drop from the target set', async (_label, argv) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(argv, '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('Invalid --agent value')
  })

  it('maps detected agents onto the installer namespace, not Orca ids', async () => {
    const home = await createHomeDir()
    vi.stubEnv('HOME', home)
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    detectCommandsMock.mockReturnValue(new Set<string>(['claude', 'cursor-agent', 'rovo']))

    await main(['skills', 'install', '--skill', 'alpha', '--dry-run'], '/tmp/repo')

    // Why: Orca's `claude` is `claude-code`; the installer keys follow the same
    // namespace as the old skills CLI. An agent with no known directory is
    // reported as unsupported instead of being silently skipped.
    expect(stdoutText(stdoutSpy)).toContain('.cursor/skills/alpha/SKILL.md')
    expect(stdoutText(stdoutSpy)).toContain('rovodev (unsupported agent)')
  })

  it('lists updatable skills when no --skill/--all is given', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'update'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe(
      [
        'Choose one or more skills to update:',
        '  alpha',
        '  gamma',
        '  zeta',
        '',
        'Usage: barkos skills update --skill <name> [--skill <name> ...]',
        '   or: barkos skills update --all',
        ''
      ].join('\n')
    )
  })

  it('overwrites drifted copies for update but never creates new ones', async () => {
    const home = await createHomeDir()
    vi.stubEnv('HOME', home)
    const stalePath = join(home, '.claude/skills/alpha/SKILL.md')
    await mkdir(join(home, '.claude/skills/alpha'), { recursive: true })
    await writeFile(stalePath, 'stale\n')
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'update', '--skill', 'alpha', '--skill', 'gamma'], '/tmp/repo')

    expect(await readFile(stalePath, 'utf8')).toBe('# Alpha\n\nShort.\n')
    await expect(
      readFile(join(home, '.claude/skills/gamma/SKILL.md'), 'utf8')
    ).rejects.toMatchObject({ code: 'ENOENT' })
    expect(process.exitCode).toBeUndefined()
  })

  it('never refuses an update on a bare host', async () => {
    const home = await createHomeDir()
    vi.stubEnv('HOME', home)
    detectCommandsMock.mockReturnValue(new Set<string>())
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'update', '--skill', 'alpha'], '/tmp/repo')

    // Why: update refreshes what is already placed; it chooses no new targets.
    expect(stdoutText(stdoutSpy)).toContain('(not installed)')
    expect(process.exitCode).toBeUndefined()
  })

  it('runs update for --all across every bundled skill', async () => {
    const home = await createHomeDir()
    vi.stubEnv('HOME', home)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'update', '--all'], '/tmp/repo')

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stdoutSpy.mockClear()
    expect(process.exitCode).toBeUndefined()
  })

  it('gives update --json a stable outcome schema', async () => {
    const home = await createHomeDir()
    vi.stubEnv('HOME', home)
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'update', '--skill', 'alpha', '--local', '--json'], '/tmp/repo')

    const payload = JSON.parse(stdoutText(stdoutSpy)) as {
      verb: string
      global: boolean
      outcomes: { skill: string; placements: { outcome: string }[] }[]
    }
    expect(payload.verb).toBe('update')
    expect(payload.global).toBe(false)
    expect(payload.outcomes[0].placements.every((p) => p.outcome === 'not-installed')).toBe(true)
  })

  it('refuses a real run when the shell forwards barkos to the host machine', async () => {
    vi.stubEnv('ORCA_CLI_CWD', '/home/alice/wt')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(['skills', 'install', '--skill', 'alpha'], '/tmp/repo')

    // Why: the SSH relay and WSL bridge run argv on the remote host, so a real
    // install there would silently skip the machine the user is sitting on.
    expect(process.exitCode).toBe(1)
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('writes to the machine that runs it')
  })

  it('refuses --dry-run through the host-forwarding shim too', async () => {
    vi.stubEnv('ORCA_CLI_CWD', '/home/alice/wt')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(['skills', 'install', '--skill', 'alpha', '--dry-run'], '/tmp/repo')

    // Why: the targets are resolved from THIS host's agents, so a command printed
    // here would name the wrong machine's agents. Point at the target instead.
    expect(process.exitCode).toBe(1)
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('writes to the machine that runs it')
  })

  it('reports forwarding, not missing agents, when a forwarded host detects none', async () => {
    vi.stubEnv('ORCA_CLI_CWD', '/home/alice/wt')
    detectCommandsMock.mockReturnValue(new Set<string>())
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(['skills', 'install', '--skill', 'alpha'], '/tmp/repo')

    // Why: resolving targets first would hide the forwarding problem behind a
    // no-agent error about the wrong machine.
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('writes to the machine that runs it')
  })

  it('documents --agent for skills install rather than the terminal-launch flag', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(['skills', 'install', '--help'], '/tmp/repo')

    const help = String(logSpy.mock.calls[0]?.[0])
    expect(help).toContain('--agent <names>')
    expect(help).not.toContain('Launch a known TUI agent')
  })

  it('collapses an alias and its canonical name into one skill', async () => {
    const home = await createHomeDir()
    vi.stubEnv('HOME', home)
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(
      ['skills', 'install', '--skill', 'alpha', '--skill', 'legacy-alpha', '--dry-run'],
      '/tmp/repo'
    )

    // Why: both names resolve to `alpha`, so its planned path appears once.
    expect(stdoutText(stdoutSpy).match(/alpha:/g)?.length).toBe(1)
  })
})

async function createHomeDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'barkos-skills-home-'))
}

function stdoutText(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((call) => String(call[0])).join('')
}
