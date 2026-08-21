import { isTuiAgent } from '../tui-agent-config'
import type { TuiAgent } from '../tui-agent'
import { ALL_TUI_AGENTS, TUI_AGENT_DISPLAY_NAMES } from '../tui-agent-display-names'
import { isTuiAgentEnabled } from '../tui-agent-selection'

// Why: new companies previously hardcoded `codex`, so on a machine without the
// Codex CLI the whole folder→task→agent chain failed before it started. Prefer
// the mainstream orchestration agents, then any other detected agent.
const BARKOS_DEFAULT_AGENT_PREFERENCE = [
  'codex',
  'claude',
  'opencode',
  'gemini',
  'grok',
  'droid'
] as const satisfies readonly TuiAgent[]

export function resolveBarkosDefaultCompanyAgentId(args: {
  detectedAgentIds?: readonly string[] | null
  disabledTuiAgents?: Iterable<unknown> | null
}): TuiAgent {
  const detected = new Set(
    (args.detectedAgentIds ?? []).filter((agent): agent is TuiAgent => isTuiAgent(agent))
  )
  const isLaunchable = (agent: TuiAgent): boolean =>
    detected.has(agent) && isTuiAgentEnabled(agent, args.disabledTuiAgents)
  for (const agent of BARKOS_DEFAULT_AGENT_PREFERENCE) {
    if (isLaunchable(agent)) {
      return agent
    }
  }
  for (const agent of ALL_TUI_AGENTS) {
    if (isLaunchable(agent)) {
      return agent
    }
  }
  // Why: detection may not have finished yet; keep the historical default so a
  // fresh offline install still creates a company. The intake preflight reports
  // the precise gap when this agent cannot actually launch.
  return 'codex'
}

/** Human-readable agent label for diagnostics; falls back to the raw id. */
export function barkosAgentDisplayName(agent: string): string {
  return isTuiAgent(agent) ? TUI_AGENT_DISPLAY_NAMES[agent] : agent
}
