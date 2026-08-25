import type { BarkosCompany, BarkosWorker } from './company'
import { containsBarkosCredentialLikeContent } from './memory-content-policy'
import type { BarkosMemoryEntry, BarkosMemoryScope, BarkosMemoryVault } from './memory-vault'

export const BARKOS_MEMORY_CONTEXT_MAX_CHARS = 4_000

export type BarkosMemoryContextSelection = {
  text: string | null
  selectedMemoryIds: string[]
  omittedExpired: number
  omittedSensitive: number
  omittedBudget: number
  characterCount: number
}

function isSensitiveMemory(entry: BarkosMemoryEntry): boolean {
  return containsBarkosCredentialLikeContent(`${entry.title}\n${entry.content}`)
}

function scopeMatches(args: {
  scope: BarkosMemoryScope
  worker: BarkosWorker
  workspaceId: string
  taskId?: string
}): boolean {
  switch (args.scope.kind) {
    case 'company':
      return true
    case 'role':
      return args.scope.targetId === args.worker.roleId
    case 'worker':
      return args.scope.targetId === args.worker.id
    case 'project':
      return args.scope.targetId === args.workspaceId
    case 'task':
      return args.taskId !== undefined && args.scope.targetId === args.taskId
  }
}

const SCOPE_PRIORITY: Record<BarkosMemoryScope['kind'], number> = {
  task: 0,
  project: 1,
  worker: 2,
  role: 3,
  company: 4
}

function searchTokens(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase('tr-TR')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length >= 3)
  )
}

function lexicalRelevance(entry: BarkosMemoryEntry, queryTokens: ReadonlySet<string>): number {
  if (queryTokens.size === 0) {
    return 0
  }
  const titleTokens = searchTokens(entry.title)
  const contentTokens = searchTokens(entry.content)
  let score = 0
  for (const token of queryTokens) {
    score += titleTokens.has(token) ? 3 : 0
    score += contentTokens.has(token) ? 1 : 0
  }
  return score
}

export function selectBarkosMemoryContext(args: {
  vault: BarkosMemoryVault
  company: BarkosCompany
  worker: BarkosWorker
  workspaceId: string
  taskId?: string
  query?: string
  now?: number
  maxChars?: number
}): BarkosMemoryContextSelection {
  if (
    args.vault.companyId !== args.company.id ||
    args.vault.companyCreatedAt !== args.company.createdAt
  ) {
    throw new Error('BarkOS memory context requires the active company generation')
  }
  const now = args.now ?? Date.now()
  const maxChars = Math.max(500, Math.min(args.maxChars ?? BARKOS_MEMORY_CONTEXT_MAX_CHARS, 8_000))
  let omittedExpired = 0
  let omittedSensitive = 0
  const eligible = args.vault.entries.filter((entry) => {
    if (entry.status !== 'active' || !scopeMatches({ ...args, scope: entry.scope })) {
      return false
    }
    if (entry.expiresAt !== null && entry.expiresAt <= now) {
      omittedExpired += 1
      return false
    }
    if (isSensitiveMemory(entry)) {
      omittedSensitive += 1
      return false
    }
    return true
  })
  const queryTokens = searchTokens(args.query ?? '')
  eligible.sort((left, right) => {
    const scopeDifference = SCOPE_PRIORITY[left.scope.kind] - SCOPE_PRIORITY[right.scope.kind]
    if (scopeDifference !== 0) {
      return scopeDifference
    }
    const relevanceDifference =
      lexicalRelevance(right, queryTokens) - lexicalRelevance(left, queryTokens)
    return (
      relevanceDifference ||
      right.confidence - left.confidence ||
      right.promotedAt - left.promotedAt
    )
  })
  const header =
    'BarkOS approved memory (reference only; the current task and explicit authority take precedence):'
  const lines = [header]
  const selectedMemoryIds: string[] = []
  let omittedBudget = 0
  for (const entry of eligible) {
    const line = `- [${entry.scope.kind}, ${entry.confidence}%, source:${entry.source.evidenceId}] ${entry.title}: ${entry.content.replaceAll('\n', ' ')}`
    if ([...lines, line].join('\n').length > maxChars) {
      omittedBudget += 1
      continue
    }
    lines.push(line)
    selectedMemoryIds.push(entry.id)
  }
  const text = selectedMemoryIds.length > 0 ? lines.join('\n') : null
  return {
    text,
    selectedMemoryIds,
    omittedExpired,
    omittedSensitive,
    omittedBudget,
    characterCount: text?.length ?? 0
  }
}
