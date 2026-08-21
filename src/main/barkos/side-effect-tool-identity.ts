import { createHash } from 'node:crypto'

function canonicalJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 32) {
    return '[DEPTH_LIMIT]'
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalJsonValue(entry, depth + 1))
  }
  if (typeof value !== 'object' || value === null) {
    return value
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalJsonValue(entry, depth + 1)])
  )
}

export function getBarkosToolInputSha256(toolName: string, toolInput: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify({ toolName, toolInput: canonicalJsonValue(toolInput) }))
    .digest('hex')
}
