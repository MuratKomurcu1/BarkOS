import { describe, expect, it } from 'vitest'
import { barkosAgentDisplayName, resolveBarkosDefaultCompanyAgentId } from './company-agent-default'

describe('resolveBarkosDefaultCompanyAgentId', () => {
  it('prefers codex, then claude, then opencode among detected agents', () => {
    expect(resolveBarkosDefaultCompanyAgentId({ detectedAgentIds: ['codex', 'claude'] })).toBe(
      'codex'
    )
    expect(resolveBarkosDefaultCompanyAgentId({ detectedAgentIds: ['opencode', 'codex'] })).toBe(
      'codex'
    )
    expect(resolveBarkosDefaultCompanyAgentId({ detectedAgentIds: ['opencode'] })).toBe('opencode')
  })

  it('skips disabled agents even when detected', () => {
    expect(
      resolveBarkosDefaultCompanyAgentId({
        detectedAgentIds: ['claude', 'opencode'],
        disabledTuiAgents: ['codex', 'claude']
      })
    ).toBe('opencode')
    expect(
      resolveBarkosDefaultCompanyAgentId({
        detectedAgentIds: ['claude'],
        disabledTuiAgents: ['claude']
      })
    ).toBe('codex')
  })

  it('ignores unknown agent ids from detection', () => {
    expect(resolveBarkosDefaultCompanyAgentId({ detectedAgentIds: ['not-an-agent'] })).toBe('codex')
  })

  it('falls through to the full agent list for exotic detected agents', () => {
    expect(resolveBarkosDefaultCompanyAgentId({ detectedAgentIds: ['goose'] })).toBe('goose')
  })

  it('keeps codex when detection has not reported anything yet', () => {
    expect(resolveBarkosDefaultCompanyAgentId({})).toBe('codex')
    expect(resolveBarkosDefaultCompanyAgentId({ detectedAgentIds: null })).toBe('codex')
    expect(resolveBarkosDefaultCompanyAgentId({ detectedAgentIds: [] })).toBe('codex')
  })
})

describe('barkosAgentDisplayName', () => {
  it('maps known ids to display names and keeps unknown ids readable', () => {
    expect(barkosAgentDisplayName('opencode')).toBe('OpenCode')
    expect(barkosAgentDisplayName('mystery-cli')).toBe('mystery-cli')
  })
})
