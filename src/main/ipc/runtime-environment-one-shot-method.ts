import { BARKOS_TEST_EVIDENCE_RUNTIME_METHOD } from '../../shared/barkos/test-evidence-run'

export function shouldUseOneShotRuntimeRequest(method: string): boolean {
  return (
    method === 'session.tabs.list' ||
    method === 'session.tabs.listAll' ||
    // Why: a dedicated socket close propagates cancellation to the host child process.
    method === BARKOS_TEST_EVIDENCE_RUNTIME_METHOD
  )
}
