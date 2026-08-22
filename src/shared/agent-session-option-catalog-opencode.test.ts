import { describe, expect, it } from 'vitest'
import { getAgentSessionOptionCatalog } from './agent-session-option-catalog'
import {
  OPENCODE_SESSION_OPTION_CATALOG,
  parseOpencodeCatalogModels
} from './agent-session-option-catalog-opencode'
import { resolveAgentSessionOptionLaunch } from './agent-session-option-launch'

describe('opencode session option catalog', () => {
  it('is registered for the opencode agent', () => {
    expect(getAgentSessionOptionCatalog('opencode')).toBe(OPENCODE_SESSION_OPTION_CATALOG)
  })

  it('seeds only the verified out-of-box models and names no default', () => {
    expect(
      OPENCODE_SESSION_OPTION_CATALOG.models.map(({ id, label, isDefault }) => ({
        id,
        label,
        isDefault
      }))
    ).toEqual([
      {
        id: 'opencode/mimo-v2.5-free',
        label: 'OpenCode MiMo V2.5 Ücretsiz',
        isDefault: undefined
      }
    ])
    // The CLI default comes from user config, so an untouched draft must launch vanilla.
    expect(OPENCODE_SESSION_OPTION_CATALOG.defaultModelIsCliDefault).toBeUndefined()
  })

  it('opts into worker launch preferences and authoritative discovery', () => {
    expect(OPENCODE_SESSION_OPTION_CATALOG.supportsWorkerLaunchPreferences).toBe(true)
    expect(OPENCODE_SESSION_OPTION_CATALOG.discoveredModelsAreAuthoritative).toBe(true)
  })

  it('delegates mid-session model changes to the TUI model picker', () => {
    const midSession = OPENCODE_SESSION_OPTION_CATALOG.modelApply.midSession
    // No direct `/model <id>` slash command exists to type a value into.
    expect(midSession).toEqual({ kind: 'agent-picker', command: '/models' })
  })
})

describe('opencode launch args', () => {
  it('emits the provider/model flag for a seeded pick', () => {
    expect(resolveAgentSessionOptionLaunch('opencode', { model: 'opencode/gpt-5.4-mini' })).toEqual(
      {
        args: ['--model', 'opencode/gpt-5.4-mini'],
        appliedValues: { model: 'opencode/gpt-5.4-mini' }
      }
    )
  })

  it('emits exactly the two model tokens', () => {
    expect(OPENCODE_SESSION_OPTION_CATALOG.modelApply.launchArgs!('opencode/deepseek-v4')).toEqual([
      '--model',
      'opencode/deepseek-v4'
    ])
  })

  it('still emits the flag for an unseeded discovered id', () => {
    expect(
      resolveAgentSessionOptionLaunch('opencode', { model: 'anthropic/claude-opus-4-8' })
    ).toEqual({
      args: ['--model', 'anthropic/claude-opus-4-8'],
      appliedValues: { model: 'anthropic/claude-opus-4-8' }
    })
  })

  it('spawns vanilla when no model was ever picked', () => {
    expect(resolveAgentSessionOptionLaunch('opencode', undefined)).toEqual({
      args: [],
      appliedValues: {}
    })
  })
})

describe('opencode agentArgsOverride', () => {
  const modelOverride = OPENCODE_SESSION_OPTION_CATALOG.modelApply.agentArgsOverride!

  it('detects a user-supplied model flag in every spelling', () => {
    for (const tokens of [
      ['-m', 'opencode/gpt-5.4-mini'],
      ['-mopencode/gpt-5.4-mini'],
      ['--model', 'opencode/gpt-5.4-mini'],
      ['--model=opencode/gpt-5.4-mini']
    ]) {
      expect(modelOverride(tokens)).toBe(true)
    }
  })

  it('does not fire on a different flag or a positional that contains -m', () => {
    expect(modelOverride(['--model-context', '8000'])).toBe(false)
    expect(modelOverride(['explain-my-diff'])).toBe(false)
    expect(modelOverride([])).toBe(false)
  })
})

describe('parseOpencodeCatalogModels', () => {
  it('parses plain provider/model lines', () => {
    expect(parseOpencodeCatalogModels('anthropic/claude-opus-4-8\nopenai/gpt-5.4')).toEqual([
      { id: 'anthropic/claude-opus-4-8', label: 'anthropic/claude-opus-4-8', options: [] },
      { id: 'openai/gpt-5.4', label: 'openai/gpt-5.4', options: [] }
    ])
  })

  it('strips bullets and parenthetical markers', () => {
    expect(
      parseOpencodeCatalogModels(
        '- opencode/deepseek-v4-flash-free (default)\n* openai/gpt-5.4'
      ).map(({ id }) => id)
    ).toEqual(['opencode/deepseek-v4-flash-free', 'openai/gpt-5.4'])
  })

  it('drops headers, notices, bare ids, and duplicates', () => {
    expect(
      parseOpencodeCatalogModels(
        [
          'Models:',
          'opencode/deepseek-v4-flash-free',
          'opencode/deepseek-v4-flash-free',
          'gpt-5.4',
          'Use `opencode auth login` to add providers.',
          ''
        ].join('\n')
      ).map(({ id }) => id)
    ).toEqual(['opencode/deepseek-v4-flash-free'])
  })
})
