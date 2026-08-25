import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflow = parse(readFileSync('.github/workflows/barkos-cross-platform-release.yml', 'utf8'))

describe('BarkOS cross-platform release workflow', () => {
  it('packages macOS, Windows, and Linux with BarkOS artifact names', () => {
    const rows = workflow.jobs.package.strategy.matrix.include
    expect(rows.map((row) => row.os)).toEqual(['macos-15', 'windows-2022', 'ubuntu-latest'])
    expect(rows.map((row) => row.artifact_name)).toEqual([
      'barkos-macos',
      'barkos-windows',
      'barkos-linux'
    ])
    expect(JSON.stringify(rows)).not.toContain('orca-windows-setup')
  })

  it('builds release inputs and smokes every packaged CLI', () => {
    const steps = workflow.jobs.package.steps
    expect(steps.some((step) => step.run === 'pnpm run build:release')).toBe(true)
    expect(steps.some((step) => step.run === '${{ matrix.smoke_command }}')).toBe(true)
    expect(
      steps.some(
        (step) => step.if === "runner.os == 'Linux'" && step.run.includes('gir1.2-atspi-2.0')
      )
    ).toBe(true)
  })
})
