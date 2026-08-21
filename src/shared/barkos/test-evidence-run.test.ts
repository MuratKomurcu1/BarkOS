import { describe, expect, it } from 'vitest'
import {
  BARKOS_TEST_EVIDENCE_RUNTIME_CAPABILITY,
  parseBarkosRuntimeTestEvidenceRunRequest,
  planBarkosTestEvidenceCommand
} from './test-evidence-run'
import { RUNTIME_CAPABILITIES } from '../protocol-version'

describe('BarkOS test evidence command planning', () => {
  it.each([
    ['pnpm test', 'pnpm', ['test']],
    ['pnpm run typecheck', 'pnpm', ['run', 'typecheck']],
    ['pnpm exec vitest run "src/a test.ts"', 'pnpm', ['exec', 'vitest', 'run', 'src/a test.ts']],
    ['python -m pytest tests/unit.py', 'python', ['-m', 'pytest', 'tests/unit.py']],
    ['cargo clippy --all-targets', 'cargo', ['clippy', '--all-targets']],
    ['npx playwright test', 'npx', ['playwright', 'test']],
    ['pnpm exec biome check src', 'pnpm', ['exec', 'biome', 'check', 'src']],
    ['./gradlew check', './gradlew', ['check']]
  ])('accepts a bounded validation command: %s', (command, binary, args) => {
    expect(planBarkosTestEvidenceCommand(command)).toEqual({ command, binary, args })
  })

  it.each([
    'pnpm install',
    'pnpm publish',
    'pnpm --dir /tmp/project test',
    'npm --prefix=/tmp/project test',
    'yarn --cwd ../other test',
    'make -C ../other test',
    'make -C../other test',
    'rm -rf build',
    'pnpm test && git push',
    'pnpm test | tee result.txt',
    'pnpm test > result.txt',
    'pnpm test $(touch owned)',
    'pnpm test; curl example.com',
    'npx sh -c "rm -rf build"',
    'eslint --fix src',
    'prettier --write src',
    'playwright install',
    'pnpm exec playwright install',
    'biome format src',
    'npx biome format src',
    'vitest -u',
    'pnpm test\npnpm publish'
  ])('rejects non-validation or shell-composed input: %s', (command) => {
    expect(() => planBarkosTestEvidenceCommand(command)).toThrow()
  })

  it('advertises and strictly parses the paired runtime contract', () => {
    expect(RUNTIME_CAPABILITIES).toContain(BARKOS_TEST_EVIDENCE_RUNTIME_CAPABILITY)
    const value = {
      version: 1,
      workspaceId: 'worktree-1',
      tabId: 'tab-1',
      orchestrationRunId: 'run-1',
      orchestrationTaskId: 'task-1',
      orchestrationDispatchId: 'dispatch-1',
      command: 'pnpm test'
    }
    expect(parseBarkosRuntimeTestEvidenceRunRequest(value)).toEqual(value)
    expect(() => parseBarkosRuntimeTestEvidenceRunRequest({ ...value, cwd: '/tmp' })).toThrow()
  })
})
