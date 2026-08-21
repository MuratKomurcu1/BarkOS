import type { AgentHookToolUseDecision, AgentHookToolUseRequest } from '../agent-hooks/server'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import {
  createAgentHookSideEffectRelayResponse,
  type AgentHookSideEffectRelayResponse
} from '../../shared/agent-hook-side-effect-relay'
import {
  appendBarkosSideEffectApproval,
  consumeBarkosSideEffectApproval,
  createBarkosSideEffectApprovalRequest,
  expireBarkosSideEffectApproval,
  resolveBarkosSideEffectApproval
} from '../../shared/barkos/side-effect-approval'
import type { BarkosDecisionInbox, BarkosDecisionRequest } from '../../shared/barkos/decision-inbox'
import type {
  BarkosPairedSideEffectApprovalAuthority,
  BarkosPairedSideEffectApprovalVersion
} from '../../shared/barkos/paired-side-effect-approval'
import {
  isBarkosLocalSideEffectAgent,
  isBarkosRemoteSideEffectAgent
} from '../../shared/barkos/side-effect-capable-agent'
import { BarkosCompanyStore } from './company-store'
import { BarkosDecisionInboxStore } from './decision-inbox-store'
import { BarkosWorkLedgerStore } from './work-ledger-store'
import {
  classifyBarkosSideEffect,
  type BarkosSideEffectClassification
} from './side-effect-classification'
import { getBarkosToolInputSha256 } from './side-effect-tool-identity'
import {
  resolveBarkosSideEffectContext,
  type BarkosSideEffectContext
} from './side-effect-approval-context'
import { resolveBarkosPairedSideEffectContext } from './paired-side-effect-approval-context'
import { barkosApprovalStillOwnsActiveDispatch } from './side-effect-approval-active-dispatch'
import {
  createBarkosSideEffectAllowance as allow,
  createBarkosSideEffectDenial as deny,
  isBarkosPairedSideEffectRequestSupported
} from './side-effect-provider-decision'

type ApprovalOutcome = 'allowed' | 'pending' | 'rejected'

const APPROVED_RESOLUTION = 'Approved by the user for one exact tool execution.'
const REJECTED_RESOLUTION = 'Rejected by the user at the tool side-effect boundary.'

function latestMatchingRequest(
  inbox: BarkosDecisionInbox,
  context: BarkosSideEffectContext,
  inputSha256: string,
  toolName: string
): BarkosDecisionRequest | undefined {
  return inbox.requests.find(
    (request) =>
      request.sourceKind === 'side-effect' &&
      request.dispatchId === context.dispatch.id &&
      request.orchestrationDispatchId === context.dispatch.orchestrationDispatchId &&
      request.sideEffect?.toolName === toolName &&
      request.sideEffect.toolInputSha256 === inputSha256
  )
}

export class BarkosSideEffectApprovalController {
  private readonly companyStore: BarkosCompanyStore
  private readonly inboxStore: BarkosDecisionInboxStore
  private readonly ledgerStore: BarkosWorkLedgerStore

  constructor(
    userDataPath: string,
    private readonly runtime: OrcaRuntimeService,
    private readonly now: () => number = Date.now
  ) {
    this.companyStore = new BarkosCompanyStore(userDataPath)
    this.inboxStore = new BarkosDecisionInboxStore(userDataPath)
    this.ledgerStore = new BarkosWorkLedgerStore(userDataPath)
  }

  evaluate = (request: AgentHookToolUseRequest): AgentHookToolUseDecision | null => {
    if (!isBarkosLocalSideEffectAgent(request.source) || request.sideEffectEnforcement !== true) {
      return null
    }
    const classification = classifyBarkosSideEffect(request.toolName, request.toolInput)
    if (!classification) {
      return null
    }

    let context: BarkosSideEffectContext | null
    try {
      context = this.resolveContext(request)
    } catch (error) {
      console.error('[barkos] side-effect context lookup failed', error)
      return deny(
        'BarkOS could not verify the active Dispatch context, so the side effect was blocked.',
        request.source
      )
    }
    if (!context) {
      return deny(
        'BarkOS could not match this side effect to the active Dispatch, so it was blocked.',
        request.source
      )
    }
    if (!context.identityVerified) {
      return deny(
        'BarkOS blocked this side effect because the live worker identity could not be verified.',
        request.source
      )
    }

    return this.evaluateMatchedApproval(request, classification, context)
  }

  evaluateRemote = (request: AgentHookToolUseRequest): AgentHookSideEffectRelayResponse => {
    if (
      !isBarkosRemoteSideEffectAgent(request.source) ||
      request.sideEffectEnforcement !== true ||
      !request.connectionId
    ) {
      return createAgentHookSideEffectRelayResponse(false, null)
    }

    let context: BarkosSideEffectContext | null
    try {
      context = this.resolveContext(request)
    } catch (error) {
      console.error('[barkos] remote side-effect context lookup failed', error)
      return createAgentHookSideEffectRelayResponse(false, null)
    }
    if (!context) {
      return createAgentHookSideEffectRelayResponse(false, null)
    }
    if (!context.identityVerified) {
      return createAgentHookSideEffectRelayResponse(
        true,
        deny(
          'BarkOS blocked this side effect because the live worker identity could not be verified.',
          request.source
        )
      )
    }

    const classification = classifyBarkosSideEffect(request.toolName, request.toolInput)
    return createAgentHookSideEffectRelayResponse(
      true,
      classification ? this.evaluateMatchedApproval(request, classification, context) : null
    )
  }

  evaluatePaired(args: {
    request: AgentHookToolUseRequest
    authority: BarkosPairedSideEffectApprovalAuthority
    environmentId: string
    expectedRuntimeId: string
    approvalVersion: BarkosPairedSideEffectApprovalVersion
  }): AgentHookSideEffectRelayResponse {
    const { request } = args
    if (!isBarkosPairedSideEffectRequestSupported(request, args.approvalVersion)) {
      return createAgentHookSideEffectRelayResponse(false, null)
    }
    const company = this.companyStore.load()
    const ledger = company ? this.ledgerStore.load(company) : null
    const context =
      company && ledger ? resolveBarkosPairedSideEffectContext({ ...args, company, ledger }) : null
    if (!context) {
      return createAgentHookSideEffectRelayResponse(
        true,
        deny(
          'BarkOS could not match this paired side effect to the active Dispatch.',
          request.source
        )
      )
    }
    const classification = classifyBarkosSideEffect(request.toolName, request.toolInput)
    return createAgentHookSideEffectRelayResponse(
      true,
      classification ? this.evaluateMatchedApproval(request, classification, context) : null
    )
  }

  private evaluateMatchedApproval(
    request: AgentHookToolUseRequest,
    classification: BarkosSideEffectClassification,
    context: BarkosSideEffectContext
  ): AgentHookToolUseDecision | null {
    try {
      const outcome = this.evaluateApproval(request, classification, context)
      if (outcome === 'allowed') {
        // Why: Codex treats PreToolUse allow without updatedInput as invalid, and
        // OpenCode plugins cannot rewrite tool input either; a neutral output lets
        // the exact consumed retry proceed unchanged for both.
        if (request.source === 'codex' || request.source === 'opencode') {
          return null
        }
        return allow('BarkOS consumed the matching one-time user approval.', request.source)
      }
      if (outcome === 'rejected') {
        return deny(
          'The user rejected this exact BarkOS side effect for the active Dispatch.',
          request.source
        )
      }
      return deny(
        'BarkOS requires explicit approval for this side effect. Open Decision Inbox, approve the exact action, then retry it unchanged.',
        request.source
      )
    } catch (error) {
      console.error('[barkos] side-effect approval persistence failed', error)
      return deny(
        'BarkOS could not persist or consume approval, so the side effect was blocked.',
        request.source
      )
    }
  }

  resolve(requestId: string, decision: 'approved' | 'rejected'): BarkosDecisionInbox {
    const company = this.companyStore.load()
    if (!company) {
      throw new Error('barkos_company_not_found')
    }
    return this.inboxStore.mutate(company, (inbox) => {
      const request = inbox.requests.find((entry) => entry.id === requestId)
      if (!request?.sideEffect || request.sourceKind !== 'side-effect') {
        throw new Error('BarkOS side-effect approval was not found')
      }
      if (
        decision === 'approved' &&
        !barkosApprovalStillOwnsActiveDispatch({
          company,
          request,
          ledgerStore: this.ledgerStore,
          runtime: this.runtime
        })
      ) {
        throw new Error('BarkOS side-effect approval no longer belongs to an active Dispatch')
      }
      return resolveBarkosSideEffectApproval({
        inbox,
        requestId,
        kind: decision,
        resolution: decision === 'approved' ? APPROVED_RESOLUTION : REJECTED_RESOLUTION,
        now: this.now()
      })
    })
  }

  private resolveContext(request: AgentHookToolUseRequest): BarkosSideEffectContext | null {
    const company = this.companyStore.load()
    if (!company) {
      return null
    }
    const ledger = this.ledgerStore.load(company)
    if (!ledger) {
      return null
    }
    return resolveBarkosSideEffectContext({ request, company, ledger, runtime: this.runtime })
  }

  private evaluateApproval(
    request: AgentHookToolUseRequest,
    classification: BarkosSideEffectClassification,
    context: BarkosSideEffectContext
  ): ApprovalOutcome {
    const now = this.now()
    const inputSha256 = getBarkosToolInputSha256(request.toolName, request.toolInput)
    let outcome: ApprovalOutcome = 'pending'
    this.inboxStore.mutate(context.company, (initialInbox) => {
      const inbox = initialInbox
      const existing = latestMatchingRequest(inbox, context, inputSha256, request.toolName)
      if (existing?.status === 'pending' && existing.sideEffect!.expiresAt <= now) {
        return expireBarkosSideEffectApproval({ inbox, requestId: existing.id, now })
      }
      if (existing?.status === 'resolved' && existing.resolutionKind === 'rejected') {
        outcome = 'rejected'
        return inbox
      }
      if (
        existing?.status === 'resolved' &&
        existing.resolutionKind === 'approved' &&
        existing.sideEffect?.consumedAt === null
      ) {
        outcome = 'allowed'
        return consumeBarkosSideEffectApproval({ inbox, requestId: existing.id, now })
      }
      if (existing?.status === 'pending') {
        return inbox
      }
      const requestBaseId = `side-effect:${context.dispatch.id}:${inputSha256}`
      const sequence =
        inbox.requests.filter((entry) => entry.id.startsWith(`${requestBaseId}:`)).length + 1
      return appendBarkosSideEffectApproval({
        inbox,
        request: createBarkosSideEffectApprovalRequest({
          id: requestBaseId,
          taskId: context.task.id,
          assignmentId: context.assignment.id,
          dispatchId: context.dispatch.id,
          workerId: context.assignment.workerId,
          executionHostId: context.dispatch.executionHostId,
          orchestrationRunId: context.dispatch.orchestrationRunId!,
          orchestrationTaskId: context.dispatch.orchestrationTaskId!,
          orchestrationDispatchId: context.dispatch.orchestrationDispatchId!,
          paneKey: request.paneKey,
          categories: classification.categories,
          toolName: request.toolName,
          toolInputSha256: inputSha256,
          summary: classification.summary,
          sequence,
          now
        }),
        now
      })
    })
    return outcome
  }
}
