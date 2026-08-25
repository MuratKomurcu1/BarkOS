import { describe, expect, it } from 'vitest'
import {
  BARKOS_AUTONOMOUS_AGENT_IDS,
  barkosAutonomousAgentSchema,
  selectBarkosAutonomousAgent
} from './provider-capabilities'

describe('BarkOS sağlayıcı yetenekleri', () => {
  it('yalnız güvenli yan etki hattına bağlı ajanları kabul eder', () => {
    expect(BARKOS_AUTONOMOUS_AGENT_IDS).toEqual(['codex', 'claude', 'opencode', 'gemini', 'droid'])
    expect(barkosAutonomousAgentSchema.safeParse('aider').success).toBe(false)
  })

  it('iş yüküne uymayan tercihi kullanmak yerine uygun sağlayıcıyı seçer', () => {
    expect(
      selectBarkosAutonomousAgent({
        workload: 'documentation',
        available: ['opencode', 'gemini'],
        preferred: 'opencode'
      })
    ).toBe('gemini')
  })
})
