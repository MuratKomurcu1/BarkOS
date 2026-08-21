import {
  BARKOS_REMOTE_USAGE_COST_METHOD,
  barkosRemoteUsageCostRequestSchema
} from '../../../../shared/barkos/remote-usage-cost'
import { defineMethod, type RpcAnyMethod } from '../core'

export const BARKOS_USAGE_COST_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: BARKOS_REMOTE_USAGE_COST_METHOD,
    params: barkosRemoteUsageCostRequestSchema,
    handler: (params, context) => {
      if (!context.pairedDeviceId || context.clientKind !== 'runtime') {
        throw new Error('barkos_remote_usage_cost_unauthorized')
      }
      return context.runtime.collectBarkosRemoteUsageCosts(params, context.pairedDeviceId)
    }
  })
]
