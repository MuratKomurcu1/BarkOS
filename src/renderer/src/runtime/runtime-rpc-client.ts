import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import { withBrowserPaneUiRuntimeRpcSource } from '../../../shared/runtime-rpc-feature-interaction-source'
import { isOrchestrationMutation } from '../../../shared/orchestration-rpc-contract'
import { ORCHESTRATION_CONTRACT_RUNTIME_CAPABILITY } from '../../../shared/protocol-version'
import { createRuntimeRpcAbortError } from './abortable-runtime-environment-call'
import {
  assertRuntimeEnvironmentCapability,
  ensureRuntimeEnvironmentCompatible
} from './runtime-compatibility-cache'
import { callRuntimeEnvironmentWithRevision } from './runtime-rpc-environment-call'
import { RuntimeRpcCallError, unwrapRuntimeRpcResult } from './runtime-rpc-result'
import { captureRuntimeEnvironmentRequestRevision } from './runtime-environment-revision'
import type { RuntimeClientTarget } from './runtime-client-target'

export {
  getActiveRuntimeTarget,
  settingsForRuntimeOwner,
  type RuntimeClientTarget
} from './runtime-client-target'
export {
  hasRuntimeRpcErrorCode,
  RuntimeRpcCallError,
  unwrapRuntimeRpcResult
} from './runtime-rpc-result'

// Why: mobile-scope device tokens are denied non-allowlisted runtime methods
// with code 'forbidden'. Callers use this to surface one scope-mismatch banner
// instead of silently swallowing the failure into empty/retry-looping UI.
export function isRuntimeScopeForbiddenError(error: unknown): boolean {
  return error instanceof RuntimeRpcCallError && error.code === 'forbidden'
}

export async function callRuntimeRpc<TResult>(
  target: RuntimeClientTarget,
  method: string,
  params?: unknown,
  options: {
    timeoutMs?: number
    suppressFeatureInteraction?: boolean
    reuseRecentCompatibilityFailure?: boolean
    skipCompatibilityCheck?: boolean
    signal?: AbortSignal
    expectedEnvironmentPairingRevision?: number
  } = {}
): Promise<TResult> {
  const expectedEnvironmentPairingRevision =
    target.kind === 'environment'
      ? captureRuntimeEnvironmentRequestRevision(
          target.environmentId,
          options.expectedEnvironmentPairingRevision
        )
      : undefined
  if (
    target.kind === 'environment' &&
    method !== 'status.get' &&
    options.skipCompatibilityCheck !== true
  ) {
    await ensureRuntimeEnvironmentCompatible(target.environmentId, {
      ...options,
      expectedEnvironmentPairingRevision
    })
  }
  if (target.kind === 'environment' && isOrchestrationMutation(method, params)) {
    // Why: paired orchestration mutations assume the worker contract shipped with
    // the current client; legacy runtimes must not receive them half-applied.
    await assertRuntimeEnvironmentCapability(
      target.environmentId,
      ORCHESTRATION_CONTRACT_RUNTIME_CAPABILITY,
      'Bu çalışma zamanı güncel orkestrasyon sözleşmesini desteklemiyor.'
    )
  }
  if (options.signal?.aborted) {
    throw createRuntimeRpcAbortError()
  }
  const nextParams = options.suppressFeatureInteraction
    ? withBrowserPaneUiRuntimeRpcSource(params)
    : params
  const response =
    target.kind === 'local'
      ? await window.api.runtime.call({ method, params: nextParams })
      : await callRuntimeEnvironmentWithRevision({
          environmentId: target.environmentId,
          method,
          params: nextParams,
          timeoutMs: options.timeoutMs,
          signal: options.signal,
          expectedEnvironmentPairingRevision
        })
  return unwrapRuntimeRpcResult<TResult>(response as RuntimeRpcResponse<TResult>)
}

export {
  assertRuntimeEnvironmentCapability,
  clearRecentRuntimeCompatibilityFailure,
  clearRuntimeCompatibilityCache,
  clearRuntimeCompatibilityCacheForTests,
  getRuntimeEnvironmentStatus,
  markRuntimeEnvironmentCompatible,
  runtimeEnvironmentSupportsCapability
} from './runtime-compatibility-cache'
