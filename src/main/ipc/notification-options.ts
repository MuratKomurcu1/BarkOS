import type { NotificationDispatchRequest } from '../../shared/notification-settings-types'
import { translateMain } from '../i18n/main-i18n'

const NOTIFICATION_AGENT_LABEL_MAX_LENGTH = 40
const NOTIFICATION_TITLE_CONTEXT_MAX_LENGTH = 80
const NOTIFICATION_BODY_PREVIEW_MAX_LENGTH = 180

const AGENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  claude: 'Claude',
  openclaude: 'OpenClaude',
  codex: 'Codex',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
  opencode: 'OpenCode',
  cursor: 'Cursor',
  aider: 'Aider',
  pi: 'Pi',
  omp: 'OMP',
  droid: 'Droid',
  grok: 'Grok',
  hermes: 'Hermes'
}

export function buildNotificationOptions(args: NotificationDispatchRequest): {
  title: string
  body: string
  silent?: boolean
  sound?: string
} {
  if (args.source === 'terminal-bell') {
    const workspace = args.worktreeLabel ?? translateMain('notifications.workspace', 'workspace')
    return {
      title: translateMain('notifications.terminalBell.title', `Bell in ${workspace}`, {
        workspace
      }),
      body: args.repoLabel
        ? translateMain(
            'notifications.terminalBell.repoBody',
            `${args.repoLabel} · Attention requested`,
            { repo: args.repoLabel }
          )
        : translateMain('notifications.terminalBell.body', 'Attention requested')
    }
  }

  if (args.source === 'test') {
    return {
      title: translateMain('notifications.test.title', 'BarkOS notifications are on'),
      body: translateMain('notifications.test.body', 'This is a test notification from BarkOS.')
    }
  }

  const richOptions = buildAgentTaskCompleteNotificationOptions(args)
  if (richOptions) {
    return richOptions
  }

  return buildAgentTaskCompleteFallbackNotificationOptions(args)
}

function buildAgentTaskCompleteNotificationOptions(
  args: NotificationDispatchRequest
): { title: string; body: string } | null {
  if (!hasAgentNotificationSnapshot(args)) {
    return null
  }

  const agentLabel = formatNotificationAgentLabel(args.agentType)
  const worktreeContext = formatNotificationWorktreeContext(args)
  const statusText =
    args.agentState === 'blocked' || args.agentState === 'waiting'
      ? translateMain('notifications.agent.needsInput', 'needs input')
      : args.agentState === 'done' && args.agentInterrupted
        ? translateMain('notifications.agent.stopped', 'stopped')
        : translateMain('notifications.agent.finished', 'finished')

  return {
    title: `${worktreeContext} - ${agentLabel} ${statusText}`,
    body: buildAgentTaskCompleteRichBody(args) ?? `${agentLabel} ${statusText}.`
  }
}

function formatNotificationWorktreeContext(args: NotificationDispatchRequest): string {
  const worktreeLabel = normalizeNotificationText(
    args.worktreeLabel,
    NOTIFICATION_TITLE_CONTEXT_MAX_LENGTH
  )
  const repoLabel = normalizeNotificationText(args.repoLabel, NOTIFICATION_TITLE_CONTEXT_MAX_LENGTH)
  if (args.hasMultipleActiveRepos && repoLabel && worktreeLabel) {
    return normalizeNotificationText(
      `${repoLabel} / ${worktreeLabel}`,
      NOTIFICATION_TITLE_CONTEXT_MAX_LENGTH
    )
  }
  return worktreeLabel || repoLabel || translateMain('notifications.workspace', 'workspace')
}

function hasAgentNotificationSnapshot(args: NotificationDispatchRequest): boolean {
  return Boolean(
    args.agentType ||
    args.agentState ||
    args.agentPrompt ||
    args.agentToolName ||
    args.agentToolInput ||
    args.agentLastAssistantMessage ||
    args.agentInterrupted
  )
}

function buildAgentTaskCompleteRichBody(args: NotificationDispatchRequest): string | null {
  const assistantMessage = normalizeNotificationText(
    args.agentLastAssistantMessage,
    NOTIFICATION_BODY_PREVIEW_MAX_LENGTH
  )
  if (assistantMessage) {
    return assistantMessage
  }

  const toolName = normalizeNotificationText(args.agentToolName, 60)
  const toolInput = normalizeNotificationText(
    args.agentToolInput,
    NOTIFICATION_BODY_PREVIEW_MAX_LENGTH
  )
  if (toolName && toolInput) {
    return translateMain('notifications.agent.usingToolInput', `Using ${toolName}: ${toolInput}`, {
      tool: toolName,
      input: toolInput
    })
  }
  if (toolName) {
    return translateMain('notifications.agent.usingTool', `Using ${toolName}`, { tool: toolName })
  }
  if (toolInput) {
    return translateMain('notifications.agent.toolInput', `Tool input: ${toolInput}`, {
      input: toolInput
    })
  }

  return null
}

function buildAgentTaskCompleteFallbackNotificationOptions(args: NotificationDispatchRequest): {
  title: string
  body: string
} {
  const workspace = args.worktreeLabel ?? translateMain('notifications.workspace', 'workspace')
  return {
    title: translateMain('notifications.agent.taskComplete', `Task complete in ${workspace}`, {
      workspace
    }),
    body: buildAgentTaskCompleteFallbackBody(args)
  }
}

function buildAgentTaskCompleteFallbackBody(args: NotificationDispatchRequest): string {
  return args.repoLabel
    ? `${args.repoLabel}${args.terminalTitle ? ` · ${args.terminalTitle}` : ''}`
    : (args.terminalTitle ??
        translateMain('notifications.agent.fallbackBody', 'A coding agent finished working.'))
}

function formatNotificationAgentLabel(agentType: string | null | undefined): string {
  const normalized = normalizeNotificationText(agentType, NOTIFICATION_AGENT_LABEL_MAX_LENGTH)
  if (!normalized || normalized === 'unknown') {
    return translateMain('notifications.agent.label', 'Agent')
  }
  return AGENT_TYPE_LABELS[normalized] ?? normalized
}

function normalizeNotificationText(value: string | null | undefined, maxLength: number): string {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (normalized.length <= maxLength) {
    return normalized
  }
  const truncated = normalized.slice(0, maxLength - 1)
  const lastCode = truncated.charCodeAt(truncated.length - 1)
  const safeTruncated =
    lastCode >= 0xd800 && lastCode <= 0xdbff ? truncated.slice(0, -1) : truncated
  return `${safeTruncated}…`
}
