import { resolveEnvironment } from '../../shared/runtime-environment-store'
import {
  BARKOS_TEST_EVIDENCE_RUNTIME_CAPABILITY,
  BARKOS_TEST_EVIDENCE_RUNTIME_METHOD,
  BARKOS_TEST_EVIDENCE_TIMEOUT_MS,
  parseBarkosTestEvidenceRunResult,
  type BarkosRuntimeTestEvidenceRunRequest,
  type BarkosTestEvidenceRunResult
} from '../../shared/barkos/test-evidence-run'
import { callRuntimeEnvironment } from '../ipc/runtime-environment-transport-routing'

const TRANSPORT_GRACE_MS = 15_000

type RuntimeStatusShape = {
  runtimeId?: unknown
  capabilities?: unknown
}

function statusShape(value: unknown): RuntimeStatusShape | null {
  return value && typeof value === 'object' ? (value as RuntimeStatusShape) : null
}

export async function runBarkosPairedTestEvidence(args: {
  userDataPath: string
  environmentId: string
  request: BarkosRuntimeTestEvidenceRunRequest
  signal: AbortSignal
}): Promise<BarkosTestEvidenceRunResult> {
  const environment = resolveEnvironment(args.userDataPath, args.environmentId)
  const pairingRevision = environment.pairingRevision ?? environment.createdAt
  let expectedRuntimeId: string | null = null
  const response = await callRuntimeEnvironment(
    args.userDataPath,
    environment.id,
    BARKOS_TEST_EVIDENCE_RUNTIME_METHOD,
    args.request,
    BARKOS_TEST_EVIDENCE_TIMEOUT_MS + TRANSPORT_GRACE_MS,
    pairingRevision,
    undefined,
    {
      signal: args.signal,
      validateStatus: (status) => {
        if (status.ok === false) {
          throw new Error(status.error.message)
        }
        const statusResult = statusShape(status.result)
        if (
          typeof statusResult?.runtimeId !== 'string' ||
          statusResult.runtimeId !== status._meta.runtimeId ||
          !Array.isArray(statusResult.capabilities) ||
          !statusResult.capabilities.includes(BARKOS_TEST_EVIDENCE_RUNTIME_CAPABILITY)
        ) {
          throw new Error('barkos_test_paired_runtime_capability_missing')
        }
        expectedRuntimeId = statusResult.runtimeId
      }
    }
  )
  if (response.ok === false) {
    throw new Error(response.error.message)
  }
  if (expectedRuntimeId === null || response._meta.runtimeId !== expectedRuntimeId) {
    throw new Error('barkos_test_paired_runtime_changed')
  }
  return parseBarkosTestEvidenceRunResult(response.result)
}
