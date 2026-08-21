import { useCallback, useState } from 'react'
import type { BarkosCompany, BarkosWorker } from '../../../../shared/barkos/company'
import { translate } from '@/i18n/i18n'
import type { BarkosWorkerLaunchTarget } from '@/lib/barkos-worker-launch-targets'
import {
  launchBarkosWorkerSession,
  type LaunchBarkosWorkerSessionResult
} from '@/lib/launch-barkos-worker-session'
import { useBarkosWorkerLaunchTargets } from './use-barkos-worker-launch-targets'

type LaunchFailureReason = Extract<LaunchBarkosWorkerSessionResult, { ok: false }>['reason']

function launchFailureMessage(reason: LaunchFailureReason): string {
  switch (reason) {
    case 'agent-not-supported':
      return translate('barkos.company.launch.error.unsupported', 'This agent ID is not supported.')
    case 'agent-disabled':
      return translate(
        'barkos.company.launch.error.disabled',
        'This agent is disabled in settings.'
      )
    case 'agent-not-available':
      return translate(
        'barkos.company.launch.error.unavailable',
        'This agent is not available on the selected host.'
      )
    case 'role-not-found':
      return translate('barkos.company.launch.error.role', 'The assigned role could not be found.')
    case 'target-incompatible':
      return translate(
        'barkos.company.launch.error.incompatible',
        'The selected workspace does not match this worker policy.'
      )
    case 'workspace-unavailable':
      return translate(
        'barkos.company.launch.error.workspace',
        'The selected workspace is no longer available.'
      )
    case 'approval-channel-unavailable':
      return translate(
        'barkos.company.launch.error.approvalChannel',
        'The BarkOS approval boundary could not be verified on the selected host.'
      )
    case 'launch-rejected':
      return translate(
        'barkos.company.launch.error.rejected',
        'The agent launch could not be prepared.'
      )
  }
}

export function useBarkosWorkerLaunch(company: BarkosCompany | null) {
  const [worker, setWorker] = useState<BarkosWorker | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [launching, setLaunching] = useState(false)
  const { targets, defaultTargetId } = useBarkosWorkerLaunchTargets(worker)
  const role = worker ? (company?.roles.find((entry) => entry.id === worker.roleId) ?? null) : null

  const open = useCallback((nextWorker: BarkosWorker): void => {
    setError(null)
    setWorker(nextWorker)
  }, [])

  const close = useCallback((): void => {
    if (launching) {
      return
    }
    setError(null)
    setWorker(null)
  }, [launching])

  const launch = useCallback(
    async (target: BarkosWorkerLaunchTarget): Promise<void> => {
      if (!company || !worker) {
        return
      }
      setLaunching(true)
      setError(null)
      try {
        const result = await launchBarkosWorkerSession({ company, workerId: worker.id, target })
        if (!result.ok) {
          setError(launchFailureMessage(result.reason))
          return
        }
        setWorker(null)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught))
      } finally {
        setLaunching(false)
      }
    },
    [company, worker]
  )

  return { worker, role, targets, defaultTargetId, error, launching, open, close, launch }
}
