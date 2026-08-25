import { z } from 'zod'
import type { BarkosLocalSideEffectAgent } from './side-effect-capable-agent'

export const BARKOS_AUTONOMOUS_AGENT_IDS = [
  'codex',
  'claude',
  'opencode',
  'gemini',
  'droid'
] as const satisfies readonly BarkosLocalSideEffectAgent[]

export const barkosAutonomousAgentSchema = z.enum(BARKOS_AUTONOMOUS_AGENT_IDS)

export type BarkosAutonomousAgent = z.infer<typeof barkosAutonomousAgentSchema>
export type BarkosProviderWorkload =
  | 'coordination'
  | 'analysis'
  | 'implementation'
  | 'review'
  | 'documentation'
  | 'parallel-work'

export type BarkosProviderCapability = {
  agentId: BarkosAutonomousAgent
  managedActivity: boolean
  sideEffects: boolean
  workloads: readonly BarkosProviderWorkload[]
}

export const BARKOS_PROVIDER_CAPABILITIES: Readonly<
  Record<BarkosAutonomousAgent, BarkosProviderCapability>
> = {
  codex: {
    agentId: 'codex',
    managedActivity: true,
    sideEffects: true,
    workloads: ['coordination', 'analysis', 'implementation', 'review', 'parallel-work']
  },
  claude: {
    agentId: 'claude',
    managedActivity: true,
    sideEffects: true,
    workloads: ['analysis', 'implementation', 'review', 'documentation']
  },
  opencode: {
    agentId: 'opencode',
    managedActivity: false,
    sideEffects: true,
    workloads: ['implementation', 'parallel-work']
  },
  gemini: {
    agentId: 'gemini',
    managedActivity: true,
    sideEffects: true,
    workloads: ['analysis', 'implementation', 'documentation']
  },
  droid: {
    agentId: 'droid',
    managedActivity: true,
    sideEffects: true,
    workloads: ['implementation', 'review', 'parallel-work']
  }
}

export function barkosProviderRoutingGuide(): string {
  return BARKOS_AUTONOMOUS_AGENT_IDS.map((agentId) => {
    const provider = BARKOS_PROVIDER_CAPABILITIES[agentId]
    return `${agentId}: ${provider.workloads.join(', ')}`
  }).join('; ')
}

export function selectBarkosAutonomousAgent(args: {
  workload: BarkosProviderWorkload
  available: readonly BarkosAutonomousAgent[]
  preferred?: BarkosAutonomousAgent | null
}): BarkosAutonomousAgent | null {
  const eligible = args.available.filter((agentId) =>
    BARKOS_PROVIDER_CAPABILITIES[agentId].workloads.includes(args.workload)
  )
  if (args.preferred && eligible.includes(args.preferred)) {
    return args.preferred
  }
  return eligible[0] ?? null
}
