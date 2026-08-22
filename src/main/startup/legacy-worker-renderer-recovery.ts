type LegacyWorkerRendererRecoveryOptions = {
  firstWindowStartupServicesReady: Promise<void>
  managedWslCliStartupBarrierReady: Promise<void>
  localPtyProviderStartupReady: Promise<void>
  reconcile: () => Promise<unknown> | undefined
  onDeferredRecoveryError: (error: unknown) => void
}

export async function recoverLegacyWorkerTerminalsForRendererStartup(
  options: LegacyWorkerRendererRecoveryOptions
): Promise<void> {
  let providerStartupSettled = false
  const providerStartupResult = options.localPtyProviderStartupReady.then(
    () => {
      providerStartupSettled = true
      return { ok: true as const }
    },
    (error: unknown) => {
      providerStartupSettled = true
      return { ok: false as const, error }
    }
  )
  await Promise.all([
    options.firstWindowStartupServicesReady,
    options.managedWslCliStartupBarrierReady
  ])
  if (providerStartupSettled) {
    const result = await providerStartupResult
    if (!result.ok) {
      options.onDeferredRecoveryError(result.error)
    }
  } else {
    void providerStartupResult
      .then(async (result) => {
        if (!result.ok) {
          throw result.error
        }
        await options.reconcile()
      })
      .catch(options.onDeferredRecoveryError)
  }
  try {
    await options.reconcile()
  } catch (error) {
    options.onDeferredRecoveryError(error)
  }
}
