import {
  normalizeAgentProviderSession,
  type AgentProviderSessionMetadata
} from '../../shared/agent-session-resume'
import { bridgeExactCodexSessionIntoAccountHome } from './codex-account-session-bridge'
import { resolveTrustedCodexSessionResume } from './codex-session-resume-home'

export function prepareCodexAccountFailoverResume(args: {
  providerSession: unknown
  targetCodexHomePath: string
  trustedCodexHomes: readonly string[]
}): AgentProviderSessionMetadata {
  const providerSession = normalizeAgentProviderSession(args.providerSession)
  if (!providerSession || providerSession.key !== 'session_id' || !providerSession.transcriptPath) {
    throw new Error('Codex account failover requires verified rollout provenance')
  }
  const source = resolveTrustedCodexSessionResume({
    transcriptPath: providerSession.transcriptPath,
    trustedCodexHomes: args.trustedCodexHomes
  })
  if (!source) {
    throw new Error('Codex account failover rollout is unavailable or untrusted')
  }
  const targetTranscriptPath = bridgeExactCodexSessionIntoAccountHome({
    sourceCodexHomePath: source.homePath,
    targetCodexHomePath: args.targetCodexHomePath,
    sourceFilePath: source.transcriptPath
  })
  if (!targetTranscriptPath) {
    throw new Error('Codex account failover rollout could not be linked into the selected account')
  }
  return { ...providerSession, transcriptPath: targetTranscriptPath }
}
