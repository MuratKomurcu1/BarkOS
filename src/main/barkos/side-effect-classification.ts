import type { BarkosSideEffectCategory } from '../../shared/barkos/decision-inbox'

export type BarkosSideEffectClassification = {
  categories: BarkosSideEffectCategory[]
  summary: string
}

const SHELL_TOOL_NAMES = new Set([
  'bash',
  'execute',
  'shell',
  'shell_command',
  'terminal',
  'run_terminal_command',
  'run_shell_command'
])
const MUTATING_TOOL_VERBS = new Set([
  'add',
  'archive',
  'assign',
  'cancel',
  'charge',
  'create',
  'delete',
  'deploy',
  'disable',
  'enable',
  'execute',
  'invite',
  'merge',
  'move',
  'pay',
  'post',
  'publish',
  'purchase',
  'refund',
  'remove',
  'rename',
  'send',
  'set',
  'submit',
  'transfer',
  'trigger',
  'update',
  'upload',
  'write'
])
const SENSITIVE_KEY = /(authorization|cookie|credential|password|private.?key|secret|token)/i

function addCategory(
  categories: BarkosSideEffectCategory[],
  category: BarkosSideEffectCategory
): void {
  if (!categories.includes(category)) {
    categories.push(category)
  }
}

function shellCommand(toolInput: unknown): string | null {
  if (typeof toolInput !== 'object' || toolInput === null || Array.isArray(toolInput)) {
    return null
  }
  const command = (toolInput as Record<string, unknown>).command
  return typeof command === 'string' && command.trim() ? command.trim() : null
}

function classifyShell(command: string): BarkosSideEffectCategory[] {
  const categories: BarkosSideEffectCategory[] = []
  const destructive =
    /(?:^|[;&|]\s*)(?:sudo\s+)?(?:rm|rmdir|shred)\b/i.test(command) ||
    /\bgit\s+(?:reset\s+--hard|clean\s+-[^\s]*f|restore\b|checkout\s+--(?:\s|$))/i.test(command) ||
    /\b(?:drop|truncate)\s+(?:database|schema|table)\b/i.test(command) ||
    /\bterraform\s+destroy\b/i.test(command) ||
    /\bkubectl\s+delete\b/i.test(command)
  const external =
    /\bgit\s+push\b/i.test(command) ||
    /\b(?:npm|pnpm|yarn)\s+publish\b/i.test(command) ||
    /\b(?:docker|podman)\s+push\b/i.test(command) ||
    /\b(?:terraform\s+apply|kubectl\s+(?:apply|patch|scale)|vercel\s+(?:deploy|--prod))\b/i.test(
      command
    ) ||
    /\bgh\s+(?:pr\s+(?:create|merge)|release\s+create|issue\s+(?:create|close))\b/i.test(command) ||
    /\bcurl\b[^\n]*(?:\s-X\s*(?:POST|PUT|PATCH|DELETE)\b|\s--(?:data|form|upload-file)\b)/i.test(
      command
    ) ||
    /\bwget\b[^\n]*\s--post-(?:data|file)\b/i.test(command)
  const budgeted =
    /\b(?:stripe|payment|purchase|checkout|charge|invoice)\b[^\n]*(?:create|pay|send|confirm|capture)/i.test(
      command
    )
  if (destructive) {
    addCategory(categories, 'destructive')
  }
  if (external) {
    addCategory(categories, 'external')
  }
  if (budgeted) {
    addCategory(categories, 'budgeted')
  }
  return categories
}

function toolTokens(toolName: string): string[] {
  return toolName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function classifyNamedTool(toolName: string): BarkosSideEffectCategory[] {
  const normalized = toolName.toLowerCase()
  const tokens = toolTokens(toolName)
  const mutating = tokens.some((token) => MUTATING_TOOL_VERBS.has(token))
  const externalSurface =
    normalized.startsWith('mcp__') ||
    normalized.startsWith('mcp_') ||
    normalized.includes('slack') ||
    normalized.includes('github') ||
    normalized.includes('gitlab') ||
    normalized.includes('stripe') ||
    normalized.includes('email')
  if (!mutating) {
    return []
  }
  const categories: BarkosSideEffectCategory[] = []
  if (externalSurface) {
    addCategory(categories, 'external')
  }
  if (tokens.some((token) => ['delete', 'remove', 'cancel', 'disable'].includes(token))) {
    addCategory(categories, 'destructive')
  }
  if (
    normalized.includes('stripe') ||
    tokens.some((token) => ['charge', 'pay', 'purchase', 'refund', 'transfer'].includes(token))
  ) {
    addCategory(categories, 'budgeted')
  }
  return categories
}

function redactText(value: string): string {
  return value
    .replace(
      /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*)=([^\s]+)/gi,
      '$1=[REDACTED]'
    )
    .replace(/(authorization\s*:\s*(?:bearer\s+)?)[^\s'";]+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/[^\s?'";]+)\?[^\s'";]+/gi, '$1?[REDACTED]')
}

function redactInput(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return '[OMITTED]'
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => redactInput(entry, depth + 1))
  }
  if (typeof value !== 'object' || value === null) {
    return typeof value === 'string' ? redactText(value) : value
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 40)
      .map(([key, entry]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactInput(entry, depth + 1)
      ])
  )
}

function boundedSummary(toolName: string, toolInput: unknown): string {
  const command = shellCommand(toolInput)
  const body = command ? redactText(command) : JSON.stringify(redactInput(toolInput))
  const summary = `${toolName}: ${body || '(no input preview)'}`
  return summary.length <= 2_000 ? summary : `${summary.slice(0, 1_997)}...`
}

export function classifyBarkosSideEffect(
  toolName: string,
  toolInput: unknown
): BarkosSideEffectClassification | null {
  const normalizedName = toolName.trim().toLowerCase()
  const command = SHELL_TOOL_NAMES.has(normalizedName) ? shellCommand(toolInput) : null
  const categories = command ? classifyShell(command) : classifyNamedTool(toolName)
  if (categories.length === 0) {
    return null
  }
  return { categories, summary: boundedSummary(toolName, toolInput) }
}
