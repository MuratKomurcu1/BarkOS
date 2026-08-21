import type { z } from 'zod'
import type { BarkosCompany } from './company'
import { barkosWorkLedgerSchema, type BarkosWorkLedger } from './work-ledger'

function validateCompanyReferences(
  ledger: BarkosWorkLedger,
  company: BarkosCompany,
  context: z.RefinementCtx
): void {
  if (ledger.companyId !== company.id) {
    context.addIssue({
      code: 'custom',
      message: 'Work ledger company does not match the active company',
      path: ['companyId']
    })
  }
  const workerIds = new Set(company.workers.map((worker) => worker.id))
  ledger.objectives.forEach((objective, index) => {
    if (!workerIds.has(objective.createdByWorkerId)) {
      context.addIssue({
        code: 'custom',
        message: 'Objective creator is not a company worker',
        path: ['objectives', index, 'createdByWorkerId']
      })
    }
  })
  ledger.plans.forEach((plan, index) => {
    if (!workerIds.has(plan.createdByWorkerId)) {
      context.addIssue({
        code: 'custom',
        message: 'Plan creator is not a company worker',
        path: ['plans', index, 'createdByWorkerId']
      })
    }
  })
  ledger.assignments.forEach((assignment, index) => {
    if (!workerIds.has(assignment.workerId)) {
      context.addIssue({
        code: 'custom',
        message: 'Assignment worker is not in the company roster',
        path: ['assignments', index, 'workerId']
      })
    }
  })
  ledger.approvalGates.forEach((gate, index) => {
    if (!workerIds.has(gate.requestedByWorkerId)) {
      context.addIssue({
        code: 'custom',
        message: 'Approval requester is not a company worker',
        path: ['approvalGates', index, 'requestedByWorkerId']
      })
    }
  })
}

export function safeParseBarkosWorkLedgerForCompany(
  value: unknown,
  company: BarkosCompany
): z.ZodSafeParseResult<BarkosWorkLedger> {
  return barkosWorkLedgerSchema
    .superRefine((ledger, context) => validateCompanyReferences(ledger, company, context))
    .safeParse(value)
}

export function parseBarkosWorkLedgerForCompany(
  value: unknown,
  company: BarkosCompany
): BarkosWorkLedger {
  return barkosWorkLedgerSchema
    .superRefine((ledger, context) => validateCompanyReferences(ledger, company, context))
    .parse(value)
}
