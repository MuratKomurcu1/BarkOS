export type BarkosLocalSideEffectAgent = 'claude' | 'codex' | 'droid' | 'gemini' | 'opencode'
export type BarkosRemoteSideEffectAgent = 'claude' | 'codex' | 'droid' | 'gemini' | 'opencode'
export type BarkosPairedSideEffectAgent = 'claude' | 'codex' | 'droid' | 'gemini' | 'opencode'

export function isBarkosLocalSideEffectAgent(value: unknown): value is BarkosLocalSideEffectAgent {
  return (
    value === 'claude' ||
    value === 'codex' ||
    value === 'droid' ||
    value === 'gemini' ||
    value === 'opencode'
  )
}

export function isBarkosRemoteSideEffectAgent(
  value: unknown
): value is BarkosRemoteSideEffectAgent {
  return (
    value === 'claude' ||
    value === 'codex' ||
    value === 'droid' ||
    value === 'gemini' ||
    value === 'opencode'
  )
}

export function isBarkosPairedSideEffectAgent(
  value: unknown
): value is BarkosPairedSideEffectAgent {
  return (
    value === 'claude' ||
    value === 'codex' ||
    value === 'droid' ||
    value === 'gemini' ||
    value === 'opencode'
  )
}
