import type { BarkosCompany } from '../../../shared/barkos/company'
import { selectBarkosMemoryContext } from '../../../shared/barkos/memory-context'
import type { BarkosMemoryDispatchContext } from '../../../shared/barkos/memory-delivery'
import type { BarkosMemoryVault } from '../../../shared/barkos/memory-vault'
import type { BarkosWorkLedger } from '../../../shared/barkos/work-ledger'

export function selectBarkosDispatchMemoryContext(args: {
  company: BarkosCompany
  ledger: BarkosWorkLedger
  vault: BarkosMemoryVault | null
  assignmentId: string
  workspaceId: string
}): BarkosMemoryDispatchContext | null {
  const assignment = args.ledger.assignments.find((entry) => entry.id === args.assignmentId)
  const worker = assignment
    ? args.company.workers.find((entry) => entry.id === assignment.workerId)
    : undefined
  const task = assignment
    ? args.ledger.plans
        .flatMap((plan) => plan.tasks)
        .find((entry) => entry.id === assignment.taskId)
    : undefined
  if (
    !assignment ||
    !worker ||
    !task ||
    !args.vault ||
    args.vault.companyId !== args.company.id ||
    args.vault.companyCreatedAt !== args.company.createdAt
  ) {
    return null
  }
  const selection = selectBarkosMemoryContext({
    vault: args.vault,
    company: args.company,
    worker,
    workspaceId: args.workspaceId,
    taskId: task.id
  })
  return selection.text
    ? { text: selection.text, selectedMemoryIds: selection.selectedMemoryIds }
    : null
}
