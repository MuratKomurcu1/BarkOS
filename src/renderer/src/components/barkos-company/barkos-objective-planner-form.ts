import type { BarkosTask } from '../../../../shared/barkos/work-ledger'
import type { BarkosPlannedTaskInput } from '../../../../shared/barkos/objective-planner'

export const BARKOS_PLANNER_UI_TASK_LIMIT = 25

export type BarkosPlannerTaskDraft = {
  draftId: string
  title: string
  spec: string
  capabilitiesText: string
  dependencyDraftIds: string[]
  workspacePolicy: BarkosTask['workspacePolicy']
  preferredEnvironmentId: string
  risk: BarkosTask['risk']
  approvalPolicy: BarkosTask['approvalPolicy']
}

export function createBarkosPlannerTaskDraft(sequence: number): BarkosPlannerTaskDraft {
  return {
    draftId: `task-${sequence}`,
    title: '',
    spec: '',
    capabilitiesText: '',
    dependencyDraftIds: [],
    workspacePolicy: 'inherit',
    preferredEnvironmentId: '',
    risk: 'low',
    approvalPolicy: 'none'
  }
}

export function distinctPlannerCapabilities(value: string): string[] {
  const seen = new Set<string>()
  const capabilities: string[] = []
  for (const item of value.split(/[,\n]/)) {
    const capability = item.trim()
    const normalized = capability.toLocaleLowerCase('en-US')
    if (capability && !seen.has(normalized)) {
      seen.add(normalized)
      capabilities.push(capability)
    }
  }
  return capabilities
}

export function plannedTaskInput(draft: BarkosPlannerTaskDraft): BarkosPlannedTaskInput {
  return {
    draftId: draft.draftId,
    title: draft.title.trim(),
    spec: draft.spec.trim(),
    requiredCapabilities: distinctPlannerCapabilities(draft.capabilitiesText),
    dependencyDraftIds: draft.dependencyDraftIds,
    workspacePolicy: draft.workspacePolicy,
    preferredEnvironmentId: draft.preferredEnvironmentId.trim() || null,
    risk: draft.risk,
    approvalPolicy: draft.approvalPolicy
  }
}
