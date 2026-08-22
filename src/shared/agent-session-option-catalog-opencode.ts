import { hasFlag } from './agent-cli-flag-detection'
import { removeAgentArgOption } from './agent-session-option-agent-args'
import type { AgentSessionOptionCatalog, CatalogModel } from './agent-session-option-catalog-types'
import { OPENCODE_FREE_MODEL_ID, OPENCODE_FREE_MODEL_LABEL } from './opencode-free-model'

const OPENCODE_MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i

// Why: `opencode models` prints one `provider/model` id per line, optionally as a
// bullet and with a parenthetical marker such as `(default)`. Anything else is a
// header, a notice, or a provider section title.
export function parseOpencodeCatalogModels(stdout: string): CatalogModel[] {
  const seen = new Set<string>()
  const models: CatalogModel[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.trim().match(/^(?:[-*]\s+)?([a-z0-9][a-z0-9._/-]*)(?:\s+\(.*\))?$/i)
    const id = match?.[1]
    if (!id || !OPENCODE_MODEL_ID_PATTERN.test(id) || seen.has(id)) {
      continue
    }
    seen.add(id)
    models.push({ id, label: id, options: [] })
  }
  return models
}

export const OPENCODE_SESSION_OPTION_CATALOG: AgentSessionOptionCatalog = {
  // Why: seed the hosted model verified to run without provider credentials;
  // discovery overlays everything else the host's providers list.
  models: [
    {
      id: OPENCODE_FREE_MODEL_ID,
      label: OPENCODE_FREE_MODEL_LABEL,
      options: []
    }
  ],
  modelApply: {
    launchArgs: (value) => ['--model', String(value)],
    agentArgsOverride: (tokens) => hasFlag(tokens, ['-m', '--model']),
    removeAgentArgs: (tokens) => removeAgentArgOption(tokens, ['-m', '--model']),
    // Why: `/models` opens opencode's own picker — no direct `/model <id>` slash
    // command exists to type a value into, so delegate like gemini's `/model`.
    midSession: { kind: 'agent-picker', command: '/models' }
  },
  // Why: launch-time model selection only needs the verified TUI flag; effort has
  // no TUI spelling (`--variant` is a `run`-only flag), so it stays unsupported.
  supportsWorkerLaunchPreferences: true,
  // Why: `opencode models` lists exactly what the host's configured providers offer,
  // so a successful probe replaces the out-of-box seed rather than extending it.
  discoveredModelsAreAuthoritative: true,
  // Why: the CLI default comes from user config and models.dev, not a fixed choice,
  // so no row claims `isDefault` and an untouched draft launches vanilla.
  listModels: { command: 'opencode models', parse: parseOpencodeCatalogModels }
}
