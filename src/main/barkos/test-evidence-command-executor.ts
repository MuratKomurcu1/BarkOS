import { commandExecFileAsync } from '../git/runner'
import { redactString } from '../observability/redactor'
import { gitCredentialPromptGuardEnv } from '../../shared/git-credential-prompt-env'
import { stripTerminalControl } from '../../shared/terminal-control-stripping'
import {
  BARKOS_TEST_EVIDENCE_OUTPUT_BYTES,
  BARKOS_TEST_EVIDENCE_RUN_VERSION,
  BARKOS_TEST_EVIDENCE_TIMEOUT_MS,
  parseBarkosTestEvidenceRunResult,
  type BarkosTestEvidenceCommandPlan,
  type BarkosTestEvidenceRunResult
} from '../../shared/barkos/test-evidence-run'

export type BarkosTestEvidenceCommandResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  canceled?: boolean
  spawnError?: string
}

function errorOutput(error: unknown): BarkosTestEvidenceCommandResult {
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : null
  const message = error instanceof Error ? error.message : String(error)
  return {
    stdout: typeof record?.stdout === 'string' ? record.stdout : '',
    stderr: typeof record?.stderr === 'string' ? record.stderr : message,
    exitCode: typeof record?.code === 'number' ? record.code : null,
    timedOut: / timed out\.$/i.test(message),
    spawnError: message
  }
}

export async function runBarkosLocalTestEvidenceCommand(
  plan: BarkosTestEvidenceCommandPlan,
  cwd: string,
  signal: AbortSignal
): Promise<BarkosTestEvidenceCommandResult> {
  try {
    const result = await commandExecFileAsync(plan.binary, plan.args, {
      cwd,
      encoding: 'utf-8',
      env: gitCredentialPromptGuardEnv(process.env),
      maxBuffer: BARKOS_TEST_EVIDENCE_OUTPUT_BYTES,
      timeout: BARKOS_TEST_EVIDENCE_TIMEOUT_MS,
      signal
    })
    return { ...result, exitCode: 0, timedOut: false }
  } catch (error) {
    return errorOutput(error)
  }
}

function evidenceSummary(result: BarkosTestEvidenceCommandResult): string {
  const normalized = redactString(
    stripTerminalControl(`${result.stdout}\n${result.stderr}`)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim()
  )
  const prefix = result.timedOut
    ? 'Timed out after 5 minutes.'
    : result.exitCode === 0
      ? 'Exited with code 0.'
      : result.exitCode === null
        ? 'Command could not complete.'
        : `Exited with code ${result.exitCode}.`
  const remaining = 1_000 - prefix.length - 1
  return normalized ? `${prefix} ${normalized.slice(-remaining)}` : prefix
}

export function buildBarkosTestEvidenceResult(
  plan: BarkosTestEvidenceCommandPlan,
  result: BarkosTestEvidenceCommandResult,
  startedAt: number
): BarkosTestEvidenceRunResult {
  return parseBarkosTestEvidenceRunResult({
    version: BARKOS_TEST_EVIDENCE_RUN_VERSION,
    command: plan.command,
    status: result.exitCode === 0 && !result.timedOut && !result.spawnError ? 'passed' : 'failed',
    summary: evidenceSummary(result),
    durationMs: Math.min(86_400_000, Math.max(0, Date.now() - startedAt))
  })
}
