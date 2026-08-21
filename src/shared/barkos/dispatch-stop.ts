import { z } from 'zod'

const externalIdSchema = z.string().trim().min(1).max(256)
const timestampSchema = z.number().int().nonnegative()
const nullableTimestampSchema = timestampSchema.nullable()

export const barkosDispatchStopSchema = z
  .object({
    state: z.enum(['requested', 'dispatch-stopped', 'completed', 'uncertain']),
    orchestrationDispatchId: externalIdSchema,
    workerTerminalHandle: externalIdSchema,
    requestedAt: timestampSchema,
    dispatchStoppedAt: nullableTimestampSchema,
    terminalKilledAt: nullableTimestampSchema,
    settledAt: nullableTimestampSchema,
    error: z.string().trim().min(1).max(2_000).nullable()
  })
  .strict()
  .superRefine((stop, context) => {
    const dispatchStopped = stop.state === 'dispatch-stopped' || stop.state === 'completed'
    const settled = stop.state === 'completed' || stop.state === 'uncertain'
    if (
      (dispatchStopped && stop.dispatchStoppedAt === null) ||
      (stop.state === 'requested' && stop.dispatchStoppedAt !== null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Dispatch stop proof does not match its state',
        path: ['dispatchStoppedAt']
      })
    }
    if ((stop.state === 'completed') !== (stop.terminalKilledAt !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Only a completed stop can claim terminal termination',
        path: ['terminalKilledAt']
      })
    }
    if (settled !== (stop.settledAt !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Stop settlement time does not match its state',
        path: ['settledAt']
      })
    }
    if ((stop.state === 'uncertain') !== (stop.error !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Only an uncertain stop carries an error',
        path: ['error']
      })
    }
    for (const [field, value] of [
      ['dispatchStoppedAt', stop.dispatchStoppedAt],
      ['terminalKilledAt', stop.terminalKilledAt],
      ['settledAt', stop.settledAt]
    ] as const) {
      if (value !== null && value < stop.requestedAt) {
        context.addIssue({
          code: 'custom',
          message: 'Stop timestamps cannot precede the request',
          path: [field]
        })
      }
    }
  })

export type BarkosDispatchStop = z.infer<typeof barkosDispatchStopSchema>
