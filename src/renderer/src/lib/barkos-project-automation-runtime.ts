import { applyBarkosStaffingProposal } from '../../../shared/barkos/staffing-proposal'
import type { BarkosWorkLedger } from '../../../shared/barkos/work-ledger'
import { useAppStore } from '@/store'
import { startBarkosObjectiveTasks } from './barkos-project-intake-runtime'
import {
  syncBarkosWorkerReports,
  type BarkosStaffingProposalEvent
} from './sync-barkos-worker-reports'
import { findRecoverableBarkosObjectiveTasks } from './barkos-autonomous-recovery'

export type BarkosStaffingRuntimeResult = {
  addedWorkerIds: string[]
  started: number
  awaitingApproval: number
}

const BARKOS_AUTOMATION_MAX_TRANSITIONS = 4

export async function applyBarkosStaffingProposalOnRuntime(
  event: BarkosStaffingProposalEvent
): Promise<BarkosStaffingRuntimeResult> {
  const state = useAppStore.getState()
  const company = state.barkosCompany
  const ledger = state.barkosWorkLedger
  const sourceObjective = ledger?.objectives.find((objective) => objective.id === event.objectiveId)
  if (!company || !ledger || !sourceObjective) {
    throw new Error('BarkOS ekip önerisini etkin projeyle eşleştiremedi')
  }
  const application = applyBarkosStaffingProposal({
    company,
    proposal: event.proposal,
    objectiveTitle: `Uygulama: ${sourceObjective.title}`,
    objectiveBrief: `${sourceObjective.brief}\n\nBaş ajan özeti: ${event.proposal.summary}`
  })
  if (application.company !== company) {
    await state.saveBarkosCompany(application.company)
    const current = useAppStore.getState()
    if (
      current.barkosWorkLedger?.companyId !== application.company.id ||
      current.barkosWorkLedgerLoadState !== 'ready'
    ) {
      await current.loadBarkosWorkLedger(application.company.id)
    }
  }
  const implementationLedger = await useAppStore
    .getState()
    .createBarkosObjectivePlan(application.plan)
  const implementationObjective = implementationLedger.objectives.at(-1)
  if (!implementationObjective) {
    throw new Error('BarkOS uygulama hedefini oluşturamadı')
  }
  const startup = await startBarkosObjectiveTasks({
    company: application.company,
    ledger: implementationLedger,
    objectiveId: implementationObjective.id
  })
  return { addedWorkerIds: application.addedWorkerIds, ...startup }
}

function newlyReadyTasks(
  ledger: BarkosWorkLedger,
  acceptedTaskIds: readonly string[]
): Map<string, string[]> {
  const accepted = new Set(acceptedTaskIds)
  const byObjective = new Map<string, string[]>()
  for (const task of ledger.plans
    .flatMap((plan) => plan.tasks)
    .filter(
      (task) =>
        task.status === 'ready' &&
        task.dependencyIds.some((dependencyId) => accepted.has(dependencyId))
    )) {
    byObjective.set(task.objectiveId, [...(byObjective.get(task.objectiveId) ?? []), task.id])
  }
  return byObjective
}

async function runBarkosProjectAutomationTransition(): Promise<boolean> {
  const state = useAppStore.getState()
  const company = state.barkosCompany
  const ledger = state.barkosWorkLedger
  if (!company || !ledger) {
    return false
  }

  let changed = false
  if (ledger.dispatches.some((dispatch) => dispatch.state === 'running')) {
    const result = await syncBarkosWorkerReports({
      ledger,
      workerSessions: state.barkosWorkerSessions
    })
    if (result.changed) {
      changed = true
      await useAppStore.getState().loadBarkosWorkLedger(company.id)
      for (const proposal of result.staffingProposals) {
        await applyBarkosStaffingProposalOnRuntime(proposal)
      }
      for (const [objectiveId, taskIds] of newlyReadyTasks(result.ledger, result.acceptedTaskIds)) {
        const current = useAppStore.getState()
        if (!current.barkosCompany || !current.barkosWorkLedger) {
          throw new Error('BarkOS otomatik görev devamı için hazır değil')
        }
        await startBarkosObjectiveTasks({
          company: current.barkosCompany,
          ledger: current.barkosWorkLedger,
          objectiveId,
          taskIds
        })
      }
    }
  }

  const current = useAppStore.getState()
  if (!current.barkosCompany || !current.barkosWorkLedger) {
    return changed
  }
  for (const [objectiveId, taskIds] of findRecoverableBarkosObjectiveTasks(
    current.barkosWorkLedger
  )) {
    const latest = useAppStore.getState()
    if (!latest.barkosCompany || !latest.barkosWorkLedger) {
      break
    }
    const startup = await startBarkosObjectiveTasks({
      company: latest.barkosCompany,
      ledger: latest.barkosWorkLedger,
      objectiveId,
      taskIds
    })
    changed = changed || startup.started > 0 || startup.awaitingApproval > 0
  }
  return changed
}

export async function runBarkosProjectAutomationCycle(): Promise<boolean> {
  let changed = false
  for (let transition = 0; transition < BARKOS_AUTOMATION_MAX_TRANSITIONS; transition += 1) {
    const transitionChanged = await runBarkosProjectAutomationTransition()
    changed = changed || transitionChanged
    if (!transitionChanged) {
      break
    }
  }
  return changed
}
