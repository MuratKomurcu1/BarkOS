import type { AgentProviderSessionMetadata } from '../agent-session-resume'
import { getAgentResumeArgv } from '../agent-session-resume'
import type { TuiAgent } from '../tui-agent'
import type { BarkosProvider } from './provider-capacity'

export type BarkosProviderAccountMutationOutcome =
  | { status: 'applied'; evidence: 'mutation-response' | 'authoritative-readback' }
  | { status: 'not-applied'; evidence: 'authoritative-readback' }
  | { status: 'uncertain'; evidence: 'missing-readback' | 'inconsistent-response' }

export function classifyBarkosProviderAccountMutation(args: {
  requestedAccountId: string | null
  mutation: 'returned' | 'threw'
  responseActiveAccountId?: string | null
  readbackActiveAccountId?: string | null
  requireAuthoritativeReadback?: boolean
}): BarkosProviderAccountMutationOutcome {
  const responseProvided = Object.hasOwn(args, 'responseActiveAccountId')
  const readbackProvided = Object.hasOwn(args, 'readbackActiveAccountId')
  if (args.requireAuthoritativeReadback) {
    if (!readbackProvided) {
      return { status: 'uncertain', evidence: 'missing-readback' }
    }
    if (args.readbackActiveAccountId === args.requestedAccountId) {
      return { status: 'applied', evidence: 'authoritative-readback' }
    }
    if (
      args.mutation === 'threw' ||
      (responseProvided && args.responseActiveAccountId === args.readbackActiveAccountId)
    ) {
      return { status: 'not-applied', evidence: 'authoritative-readback' }
    }
    return { status: 'uncertain', evidence: 'inconsistent-response' }
  }
  if (
    args.mutation === 'returned' &&
    responseProvided &&
    args.responseActiveAccountId === args.requestedAccountId
  ) {
    return { status: 'applied', evidence: 'mutation-response' }
  }
  if (readbackProvided && args.readbackActiveAccountId === args.requestedAccountId) {
    return { status: 'applied', evidence: 'authoritative-readback' }
  }
  if (args.mutation === 'threw' && readbackProvided) {
    return { status: 'not-applied', evidence: 'authoritative-readback' }
  }
  return {
    status: 'uncertain',
    evidence: args.mutation === 'returned' ? 'inconsistent-response' : 'missing-readback'
  }
}

export function resolveBarkosProviderConversationMode(args: {
  provider: BarkosProvider
  agent: TuiAgent
  providerSession?: AgentProviderSessionMetadata
}): 'same-conversation' | 'new-session' | 'unsupported' {
  if (args.provider !== 'codex' || args.agent !== 'codex') {
    return 'unsupported'
  }
  return args.providerSession && getAgentResumeArgv('codex', args.providerSession)
    ? 'same-conversation'
    : 'new-session'
}
