import {
  BARKOS_TEST_EVIDENCE_RUNTIME_METHOD,
  barkosRuntimeTestEvidenceRunRequestSchema,
  planBarkosTestEvidenceCommand
} from '../../../../shared/barkos/test-evidence-run'
import {
  buildBarkosTestEvidenceResult,
  runBarkosLocalTestEvidenceCommand
} from '../../../barkos/test-evidence-command-executor'
import { defineMethod, type RpcAnyMethod } from '../core'

export const BARKOS_TEST_EVIDENCE_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: BARKOS_TEST_EVIDENCE_RUNTIME_METHOD,
    params: barkosRuntimeTestEvidenceRunRequestSchema,
    handler: async (params, context) => {
      if (!context.pairedDeviceId || context.clientKind !== 'runtime') {
        throw new Error('barkos_test_paired_runtime_unauthorized')
      }
      const signal = context.signal ?? new AbortController().signal
      const plan = planBarkosTestEvidenceCommand(params.command)
      const cwd = await context.runtime.resolveBarkosPairedTestEvidenceCwd(
        params,
        context.pairedDeviceId
      )
      signal.throwIfAborted()
      const startedAt = Date.now()
      const result = await runBarkosLocalTestEvidenceCommand(plan, cwd, signal)
      if (signal.aborted || result.canceled) {
        throw new Error('barkos_test_run_cancelled')
      }
      return buildBarkosTestEvidenceResult(plan, result, startedAt)
    }
  })
]
