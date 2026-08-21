import { describe, expect, it } from 'vitest'
import {
  parseBarkosRemoteUsageCostRequest,
  parseBarkosRemoteUsageCostResponse
} from './remote-usage-cost'

describe('BarkOS remote usage-cost contract', () => {
  it('accepts bounded host-owned evidence without raw provider data', () => {
    expect(
      parseBarkosRemoteUsageCostRequest({
        version: 1,
        orchestrationDispatchIds: ['dispatch-1']
      })
    ).toEqual({ version: 1, orchestrationDispatchIds: ['dispatch-1'] })
    expect(
      parseBarkosRemoteUsageCostResponse({
        version: 1,
        runtimeId: 'runtime-1',
        records: [
          {
            status: 'known',
            orchestrationDispatchId: 'dispatch-1',
            workspaceId: 'workspace-1',
            provider: 'codex',
            providerSessionId: 'session-1',
            model: 'gpt-5',
            inputTokens: 10,
            outputTokens: 4,
            cacheReadTokens: 3,
            cacheWriteTokens: null,
            reasoningOutputTokens: 2,
            totalTokens: 17,
            estimatedCostMicrousd: 40,
            estimatedCostSource: 'api-equivalent',
            attribution: 'exclusive-provider-session',
            periodStartedAt: 10,
            periodEndedAt: 20,
            collectedAt: 21
          }
        ]
      }).records[0]
    ).toMatchObject({ status: 'known', totalTokens: 17 })
  })

  it('rejects duplicates, unknown fields, invalid cost pairs, and future versions', () => {
    expect(() =>
      parseBarkosRemoteUsageCostRequest({
        version: 1,
        orchestrationDispatchIds: ['dispatch-1', 'dispatch-1']
      })
    ).toThrow(/Duplicate remote usage dispatch/)
    expect(() =>
      parseBarkosRemoteUsageCostResponse({
        version: 1,
        runtimeId: 'runtime-1',
        records: [
          {
            status: 'unavailable',
            orchestrationDispatchId: 'dispatch-1',
            reason: 'dispatch-not-found',
            detail: null,
            collectedAt: 1,
            rawTranscript: 'secret'
          }
        ]
      })
    ).toThrow()
    expect(() =>
      parseBarkosRemoteUsageCostResponse({ version: 2, runtimeId: 'runtime-1', records: [] })
    ).toThrow()
  })
})
