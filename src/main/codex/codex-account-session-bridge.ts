import { existsSync, lstatSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import { listCodexSessionRolloutFilesIncrementally } from './codex-session-file-listing'
import type { CodexSessionBridgeIncrementalOptions } from './codex-session-file-listing'
import { linkCodexSessionFile, tryHardlinkCodexSessionFile } from './codex-session-link'

/**
 * Bridges Codex history between Orca-managed Codex homes.
 *
 * Why: a managed account launches Codex against its own self-contained
 * CODEX_HOME, and Codex's `/resume` picker only lists rollouts under that home.
 * Without this, switching accounts hides every conversation the user recorded
 * under a different account (or under their real ~/.codex). Rollouts are
 * hardlinked, so each conversation stays one physical log no matter how many
 * homes list it.
 */

export type CodexAccountSessionBridgeSummary = {
  scannedFiles: number
  linkedFiles: number
}

const TRUSTED_ROLLOUT_RELATIVE_PATH =
  /^\d{4}[\\/]\d{2}[\\/]\d{2}[\\/]rollout-[^\\/:]+\.jsonl(?:\.zst)?$/

const backgroundBridgeTasksByTargetHome = new Map<string, Promise<void>>()

/**
 * Starts one background bridge per target home, sharing in-flight work.
 */
export function startCodexAccountSessionBridgeInBackground(args: {
  targetCodexHomePath: string
  sourceCodexHomePaths: readonly string[]
  options?: CodexSessionBridgeIncrementalOptions
}): Promise<void> {
  const key = normalizeRuntimePathForComparison(args.targetCodexHomePath)
  const inFlight = backgroundBridgeTasksByTargetHome.get(key)
  if (inFlight) {
    return inFlight
  }
  const task = bridgeCodexSessionsIntoAccountHome(args)
    .catch((error: unknown) => {
      console.warn('[codex-account-session-bridge] Background session bridge failed:', error)
    })
    .then(() => undefined)
  backgroundBridgeTasksByTargetHome.set(key, task)
  void task.finally(() => {
    if (backgroundBridgeTasksByTargetHome.get(key) === task) {
      backgroundBridgeTasksByTargetHome.delete(key)
    }
  })
  return task
}

/**
 * Mirrors every source home's rollouts into the target home's sessions tree.
 */
export async function bridgeCodexSessionsIntoAccountHome(args: {
  targetCodexHomePath: string
  sourceCodexHomePaths: readonly string[]
  options?: CodexSessionBridgeIncrementalOptions
}): Promise<CodexAccountSessionBridgeSummary> {
  const summary: CodexAccountSessionBridgeSummary = { scannedFiles: 0, linkedFiles: 0 }
  const targetSessionsRoot = join(args.targetCodexHomePath, 'sessions')
  for (const sourceHomePath of dedupeSourceHomes(
    args.sourceCodexHomePaths,
    args.targetCodexHomePath
  )) {
    const sourceSessionsRoot = join(sourceHomePath, 'sessions')
    if (!existsSync(sourceSessionsRoot)) {
      continue
    }
    for await (const sourceFilePath of listCodexSessionRolloutFilesIncrementally(
      sourceSessionsRoot,
      args.options ?? {}
    )) {
      summary.scannedFiles += 1
      if (bridgeRolloutIntoAccountHome(sourceSessionsRoot, targetSessionsRoot, sourceFilePath)) {
        summary.linkedFiles += 1
      }
    }
  }
  return summary
}

export function bridgeExactCodexSessionIntoAccountHome(args: {
  sourceCodexHomePath: string
  targetCodexHomePath: string
  sourceFilePath: string
}): string | null {
  const sourceSessionsRoot = join(args.sourceCodexHomePath, 'sessions')
  const relativePath = relative(sourceSessionsRoot, args.sourceFilePath)
  if (!TRUSTED_ROLLOUT_RELATIVE_PATH.test(relativePath)) {
    return null
  }
  const targetFilePath = join(args.targetCodexHomePath, 'sessions', relativePath)
  if (existsSync(targetFilePath)) {
    try {
      if (!lstatSync(targetFilePath).isFile()) {
        return null
      }
      const source = statSync(args.sourceFilePath)
      const target = statSync(targetFilePath)
      return source.dev === target.dev && source.ino === target.ino ? targetFilePath : null
    } catch {
      return null
    }
  }
  try {
    mkdirSync(dirname(targetFilePath), { recursive: true })
  } catch {
    return null
  }
  // Why: Codex ignores symlinked rollouts; an exact failover resume must prove a resume-visible hardlink.
  return tryHardlinkCodexSessionFile(args.sourceFilePath, targetFilePath) ? targetFilePath : null
}

/**
 * Links one rollout into the target sessions tree at the same relative path.
 */
function bridgeRolloutIntoAccountHome(
  sourceSessionsRoot: string,
  targetSessionsRoot: string,
  sourceFilePath: string
): boolean {
  const targetFilePath = join(targetSessionsRoot, relative(sourceSessionsRoot, sourceFilePath))
  // Why: rollout names carry the session UUID, so an existing target path is the
  // same conversation already bridged (often the same inode) — never a conflict.
  if (existsSync(targetFilePath)) {
    return false
  }
  try {
    mkdirSync(dirname(targetFilePath), { recursive: true })
  } catch (error) {
    console.warn('[codex-account-session-bridge] Failed to create session directory:', error)
    return false
  }
  return linkCodexSessionFile(sourceFilePath, targetFilePath)
}

/**
 * Drops duplicate and self-referential sources so one launch links each home once.
 */
function dedupeSourceHomes(
  sourceCodexHomePaths: readonly string[],
  targetCodexHomePath: string
): string[] {
  const seen = new Set([normalizeRuntimePathForComparison(targetCodexHomePath)])
  const sources: string[] = []
  for (const sourceHomePath of sourceCodexHomePaths) {
    const key = normalizeRuntimePathForComparison(sourceHomePath)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    sources.push(sourceHomePath)
  }
  return sources
}

export const _internals = {
  resetBackgroundBridgeTasks: (): void => {
    backgroundBridgeTasksByTargetHome.clear()
  }
}
