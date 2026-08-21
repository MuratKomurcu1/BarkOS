import { describe, expect, it } from 'vitest'
import { classifyBarkosSideEffect } from './side-effect-classification'

describe('BarkOS side-effect classification', () => {
  it('leaves ordinary local and read-only tools outside the approval boundary', () => {
    expect(classifyBarkosSideEffect('Bash', { command: 'pnpm test' })).toBeNull()
    expect(classifyBarkosSideEffect('Edit', { file_path: 'src/app.ts' })).toBeNull()
    expect(classifyBarkosSideEffect('Write', { file_path: 'src/app.ts' })).toBeNull()
    expect(classifyBarkosSideEffect('WebSearch', { query: 'BarkOS' })).toBeNull()
    expect(classifyBarkosSideEffect('mcp__github__get_issue', { issue_number: 1 })).toBeNull()
  })

  it('classifies destructive shell commands', () => {
    expect(classifyBarkosSideEffect('Bash', { command: 'rm -rf build' })?.categories).toEqual([
      'destructive'
    ])
    expect(
      classifyBarkosSideEffect('Bash', { command: 'git checkout -- src/app.ts' })?.categories
    ).toEqual(['destructive'])
  })

  it('classifies external and budgeted mutations', () => {
    expect(
      classifyBarkosSideEffect('Bash', { command: 'git push origin main' })?.categories
    ).toEqual(['external'])
    expect(
      classifyBarkosSideEffect('mcp__stripe__create_charge', { amount: 500 })?.categories
    ).toEqual(['external', 'budgeted'])
    expect(
      classifyBarkosSideEffect('Execute', { command: 'git push origin main' })?.categories
    ).toEqual(['external'])
    expect(
      classifyBarkosSideEffect('run_shell_command', { command: 'git push origin main' })?.categories
    ).toEqual(['external'])
  })

  it('redacts secrets and URL queries from persisted summaries', () => {
    const result = classifyBarkosSideEffect('Bash', {
      command:
        'API_TOKEN=top-secret curl -X POST https://example.com/deploy?access_token=leak --data ok'
    })

    expect(result?.summary).toContain('API_TOKEN=[REDACTED]')
    expect(result?.summary).toContain('https://example.com/deploy?[REDACTED]')
    expect(result?.summary).not.toContain('top-secret')
    expect(result?.summary).not.toContain('access_token=leak')
  })
})
