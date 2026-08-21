import type { z } from 'zod'
import type { BarkosWorkLedger } from './work-ledger'

export function validateBarkosMemoryDeliveries(
  ledger: BarkosWorkLedger,
  context: z.RefinementCtx
): void {
  const receiptIds = new Set<string>()
  ledger.dispatches.forEach((dispatch, index) => {
    const delivery = dispatch.memoryDelivery
    if (!delivery) {
      return
    }
    if (receiptIds.has(delivery.receiptId)) {
      context.addIssue({
        code: 'custom',
        message: 'Duplicate memory delivery receipt',
        path: ['dispatches', index, 'memoryDelivery', 'receiptId']
      })
    }
    receiptIds.add(delivery.receiptId)
    if (delivery.state === 'prepared' && dispatch.state !== 'prepared') {
      context.addIssue({
        code: 'custom',
        message: 'Prepared memory delivery requires a prepared dispatch',
        path: ['dispatches', index, 'memoryDelivery', 'state']
      })
    }
  })
}
