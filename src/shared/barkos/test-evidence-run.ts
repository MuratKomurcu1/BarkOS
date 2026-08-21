import { z } from 'zod'
import { tokenizeStartupCommand } from '../tui-agent-startup-shell'
import { barkosEntityIdSchema } from './company'

export const BARKOS_TEST_EVIDENCE_RUN_VERSION = 1 as const
export const BARKOS_TEST_EVIDENCE_RUNTIME_CAPABILITY = 'barkos.test-evidence-execution.v1' as const
export const BARKOS_TEST_EVIDENCE_RUNTIME_METHOD = 'barkos.testEvidence.run' as const
export const BARKOS_TEST_EVIDENCE_TIMEOUT_MS = 5 * 60 * 1_000
export const BARKOS_TEST_EVIDENCE_OUTPUT_BYTES = 64 * 1_024

const validationIntentPattern =
  /^(?:test|tests|lint|typecheck|type-check|check|verify|validation|validate|build)(?:$|[:_-])/i

const directValidationBinaries = new Set([
  'biome',
  'eslint',
  'jest',
  'oxlint',
  'phpunit',
  'playwright',
  'prettier',
  'pytest',
  'tsc',
  'vitest'
])

const packageRunners = new Set(['bun', 'npm', 'pnpm', 'yarn'])
const mutatingValidationFlags = new Set([
  '--fix',
  '--update-snapshots',
  '--updatesnapshot',
  '--write',
  '--write-file',
  '-u',
  '-w'
])
const workspaceOverrideFlags = new Set([
  '--chdir',
  '--cwd',
  '--dir',
  '--directory',
  '--prefix',
  '--project-dir'
])

export const barkosTestEvidenceRunRequestSchema = z.strictObject({
  version: z.literal(BARKOS_TEST_EVIDENCE_RUN_VERSION),
  dispatchId: barkosEntityIdSchema,
  command: z.string().trim().min(1).max(2_000)
})

export const barkosTestEvidenceRunResultSchema = z.strictObject({
  version: z.literal(BARKOS_TEST_EVIDENCE_RUN_VERSION),
  command: z.string().trim().min(1).max(2_000),
  status: z.enum(['passed', 'failed']),
  summary: z.string().trim().min(1).max(1_000),
  durationMs: z.number().int().nonnegative().max(86_400_000)
})

export const barkosRuntimeTestEvidenceRunRequestSchema = z.strictObject({
  version: z.literal(BARKOS_TEST_EVIDENCE_RUN_VERSION),
  workspaceId: z.string().trim().min(1).max(4_096),
  tabId: z.string().trim().min(1).max(512),
  orchestrationRunId: z.string().trim().min(1).max(512),
  orchestrationTaskId: z.string().trim().min(1).max(512),
  orchestrationDispatchId: z.string().trim().min(1).max(512),
  command: z.string().trim().min(1).max(2_000)
})

export type BarkosTestEvidenceRunRequest = z.infer<typeof barkosTestEvidenceRunRequestSchema>
export type BarkosTestEvidenceRunResult = z.infer<typeof barkosTestEvidenceRunResultSchema>
export type BarkosRuntimeTestEvidenceRunRequest = z.infer<
  typeof barkosRuntimeTestEvidenceRunRequestSchema
>

export type BarkosTestEvidenceCommandPlan = {
  command: string
  binary: string
  args: string[]
}

function executableName(binary: string): string {
  return (binary.split(/[\\/]/).at(-1) ?? '').replace(/\.(?:bat|cmd|exe)$/i, '').toLowerCase()
}

function hasValidationIntent(tokens: readonly string[]): boolean {
  return tokens.some((token) => validationIntentPattern.test(token))
}

function overridesWorkspace(argument: string): boolean {
  if (argument.startsWith('-C')) {
    return true
  }
  const normalized = argument.toLowerCase()
  const equalsIndex = normalized.indexOf('=')
  const flag = equalsIndex === -1 ? normalized : normalized.slice(0, equalsIndex)
  return workspaceOverrideFlags.has(flag)
}

function supportsValidationInvocation(binary: string, args: readonly string[]): boolean {
  const name = executableName(binary)
  if (args.some(overridesWorkspace)) {
    return false
  }
  if (args.some((arg) => mutatingValidationFlags.has(arg.toLowerCase()))) {
    return false
  }
  if (name === 'playwright') {
    return args[0]?.toLowerCase() === 'test'
  }
  if (name === 'biome') {
    return ['check', 'lint'].includes(args[0]?.toLowerCase() ?? '')
  }
  if (directValidationBinaries.has(name)) {
    return true
  }
  if (name === 'python' || name === 'python3' || name === 'py') {
    return args[0] === '-m' && ['pytest', 'unittest'].includes(args[1]?.toLowerCase() ?? '')
  }
  if (name === 'cargo') {
    return ['test', 'check', 'clippy', 'build'].includes(args[0]?.toLowerCase() ?? '')
  }
  if (name === 'go') {
    return ['test', 'vet', 'build'].includes(args[0]?.toLowerCase() ?? '')
  }
  if (name === 'dotnet') {
    return ['test', 'build'].includes(args[0]?.toLowerCase() ?? '')
  }
  if (['gradle', 'gradlew', 'mvn', 'mvnw', 'make', 'swift', 'flutter', 'dart'].includes(name)) {
    return hasValidationIntent(args)
  }
  if (name === 'npx') {
    return (
      directValidationBinaries.has(executableName(args[0] ?? '')) &&
      supportsValidationInvocation(args[0] ?? '', args.slice(1))
    )
  }
  if (!packageRunners.has(name)) {
    return false
  }
  const normalized = args.map((arg) => arg.toLowerCase())
  const execIndex = normalized.findIndex((arg) => arg === 'exec' || arg === 'dlx')
  if (execIndex !== -1) {
    const nestedBinary = args[execIndex + 1] ?? ''
    return (
      directValidationBinaries.has(executableName(nestedBinary)) &&
      supportsValidationInvocation(nestedBinary, args.slice(execIndex + 2))
    )
  }
  return (
    !normalized.some((arg) => ['add', 'install', 'publish', 'remove', 'uninstall'].includes(arg)) &&
    hasValidationIntent(args)
  )
}

export function planBarkosTestEvidenceCommand(value: unknown): BarkosTestEvidenceCommandPlan {
  const command = z.string().trim().min(1).max(2_000).parse(value)
  if (/[\0\r\n]/.test(command)) {
    throw new Error('barkos_test_command_multiline_not_allowed')
  }
  const parsed = tokenizeStartupCommand(command, 'posix')
  if (!parsed.ok || parsed.tokens.length === 0 || parsed.tokens.length > 128) {
    throw new Error('barkos_test_command_invalid')
  }
  if (parsed.spans.some((span) => span.divergesFromShell)) {
    throw new Error('barkos_test_command_shell_syntax_not_allowed')
  }
  const [binary, ...args] = parsed.tokens
  if (!supportsValidationInvocation(binary, args)) {
    throw new Error('barkos_test_command_not_validation')
  }
  return { command, binary, args }
}

export function parseBarkosTestEvidenceRunRequest(value: unknown): BarkosTestEvidenceRunRequest {
  return barkosTestEvidenceRunRequestSchema.parse(value)
}

export function parseBarkosTestEvidenceRunResult(value: unknown): BarkosTestEvidenceRunResult {
  return barkosTestEvidenceRunResultSchema.parse(value)
}

export function parseBarkosRuntimeTestEvidenceRunRequest(
  value: unknown
): BarkosRuntimeTestEvidenceRunRequest {
  return barkosRuntimeTestEvidenceRunRequestSchema.parse(value)
}
