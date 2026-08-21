import { z } from 'zod'
import { parseAgentHookSideEffectRelayResponse } from '../../../../shared/agent-hook-side-effect-relay'
import {
  BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION,
  BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V2,
  BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V3,
  BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V4,
  type BarkosPairedSideEffectApprovalResolution
} from '../../../../shared/barkos/paired-side-effect-approval'
import { defineMethod, defineStreamingMethod, type RpcAnyMethod } from '../core'

const ResolutionParams = z
  .object({
    version: z.literal(BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION),
    requestId: z.string().min(1).max(512),
    response: z
      .unknown()
      .refine((value) => parseAgentHookSideEffectRelayResponse(value) !== null, 'Invalid response')
  })
  .strict()

const ResolutionParamsV2 = z
  .object({
    version: z.literal(BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V2),
    requestId: z.string().min(1).max(512),
    response: z
      .unknown()
      .refine((value) => parseAgentHookSideEffectRelayResponse(value) !== null, 'Invalid response')
  })
  .strict()

const ResolutionParamsV3 = z
  .object({
    version: z.literal(BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V3),
    requestId: z.string().min(1).max(512),
    response: z
      .unknown()
      .refine((value) => parseAgentHookSideEffectRelayResponse(value) !== null, 'Invalid response')
  })
  .strict()

const ResolutionParamsV4 = z
  .object({
    version: z.literal(BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V4),
    requestId: z.string().min(1).max(512),
    response: z
      .unknown()
      .refine((value) => parseAgentHookSideEffectRelayResponse(value) !== null, 'Invalid response')
  })
  .strict()

function requirePairedRuntimeClient(context: {
  pairedDeviceId?: string
  clientKind?: 'mobile' | 'runtime'
}): string {
  if (!context.pairedDeviceId || context.clientKind !== 'runtime') {
    throw new Error('barkos_side_effect_approval_unauthorized')
  }
  return context.pairedDeviceId
}

export const BARKOS_SIDE_EFFECT_APPROVAL_METHODS: readonly RpcAnyMethod[] = [
  defineStreamingMethod({
    name: 'barkos.sideEffectApproval.subscribe',
    params: null,
    handler: async (_params, context, emit) => {
      const ownerDeviceId = requirePairedRuntimeClient(context)
      const broker = context.runtime.getBarkosPairedSideEffectApprovalBroker()
      const subscription = broker.subscribe(ownerDeviceId, emit)
      context.runtime.registerSubscriptionCleanup(
        subscription.subscriptionId,
        subscription.close,
        context.connectionId
      )
      await subscription.closed
      context.runtime.cleanupSubscription(subscription.subscriptionId)
    }
  }),
  defineStreamingMethod({
    name: 'barkos.sideEffectApproval.subscribeV2',
    params: null,
    handler: async (_params, context, emit) => {
      const ownerDeviceId = requirePairedRuntimeClient(context)
      const broker = context.runtime.getBarkosPairedSideEffectApprovalBroker()
      const subscription = broker.subscribe(
        ownerDeviceId,
        emit,
        BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V2
      )
      context.runtime.registerSubscriptionCleanup(
        subscription.subscriptionId,
        subscription.close,
        context.connectionId
      )
      await subscription.closed
      context.runtime.cleanupSubscription(subscription.subscriptionId)
    }
  }),
  defineStreamingMethod({
    name: 'barkos.sideEffectApproval.subscribeV3',
    params: null,
    handler: async (_params, context, emit) => {
      const ownerDeviceId = requirePairedRuntimeClient(context)
      const broker = context.runtime.getBarkosPairedSideEffectApprovalBroker()
      const subscription = broker.subscribe(
        ownerDeviceId,
        emit,
        BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V3
      )
      context.runtime.registerSubscriptionCleanup(
        subscription.subscriptionId,
        subscription.close,
        context.connectionId
      )
      await subscription.closed
      context.runtime.cleanupSubscription(subscription.subscriptionId)
    }
  }),
  defineStreamingMethod({
    name: 'barkos.sideEffectApproval.subscribeV4',
    params: null,
    handler: async (_params, context, emit) => {
      const ownerDeviceId = requirePairedRuntimeClient(context)
      const broker = context.runtime.getBarkosPairedSideEffectApprovalBroker()
      const subscription = broker.subscribe(
        ownerDeviceId,
        emit,
        BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V4
      )
      context.runtime.registerSubscriptionCleanup(
        subscription.subscriptionId,
        subscription.close,
        context.connectionId
      )
      await subscription.closed
      context.runtime.cleanupSubscription(subscription.subscriptionId)
    }
  }),
  defineMethod({
    name: 'barkos.sideEffectApproval.resolve',
    params: ResolutionParams,
    handler: (params, context) => {
      const ownerDeviceId = requirePairedRuntimeClient(context)
      const resolved = context.runtime
        .getBarkosPairedSideEffectApprovalBroker()
        .resolve(ownerDeviceId, params as BarkosPairedSideEffectApprovalResolution)
      return { resolved }
    }
  }),
  defineMethod({
    name: 'barkos.sideEffectApproval.resolveV2',
    params: ResolutionParamsV2,
    handler: (params, context) => {
      const ownerDeviceId = requirePairedRuntimeClient(context)
      const resolved = context.runtime
        .getBarkosPairedSideEffectApprovalBroker()
        .resolve(ownerDeviceId, params as BarkosPairedSideEffectApprovalResolution)
      return { resolved }
    }
  }),
  defineMethod({
    name: 'barkos.sideEffectApproval.resolveV3',
    params: ResolutionParamsV3,
    handler: (params, context) => {
      const ownerDeviceId = requirePairedRuntimeClient(context)
      const resolved = context.runtime
        .getBarkosPairedSideEffectApprovalBroker()
        .resolve(ownerDeviceId, params as BarkosPairedSideEffectApprovalResolution)
      return { resolved }
    }
  }),
  defineMethod({
    name: 'barkos.sideEffectApproval.resolveV4',
    params: ResolutionParamsV4,
    handler: (params, context) => {
      const ownerDeviceId = requirePairedRuntimeClient(context)
      const resolved = context.runtime
        .getBarkosPairedSideEffectApprovalBroker()
        .resolve(ownerDeviceId, params as BarkosPairedSideEffectApprovalResolution)
      return { resolved }
    }
  })
]
