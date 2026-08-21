import type { AgentHookSource } from '../../shared/agent-hook-relay'

type WindowsAgentHookCurlOptions = {
  discardResponse?: boolean
  failOnHttpError?: boolean
  extraFormFields?: readonly string[]
}

// Why: PowerShell per-post costs ~300ms and mangles UTF-8; system curl avoids both and prevents repo-local executable hijacking.
export function buildWindowsAgentHookCurlPostCommand(
  source: AgentHookSource,
  options: WindowsAgentHookCurlOptions = {}
): string {
  return [
    '"%SystemRoot%\\System32\\curl.exe" -sS -X POST',
    `"http://127.0.0.1:%ORCA_AGENT_HOOK_PORT%/hook/${source}"`,
    ...(options.failOnHttpError ? ['--fail'] : []),
    '--connect-timeout 0.5 --max-time 1.5',
    '-H "Content-Type: application/x-www-form-urlencoded"',
    '-H "X-Orca-Agent-Hook-Token: %ORCA_AGENT_HOOK_TOKEN%"',
    '--data-urlencode "paneKey=%ORCA_PANE_KEY%"',
    '--data-urlencode "tabId=%ORCA_TAB_ID%"',
    '--data-urlencode "launchToken=%ORCA_AGENT_LAUNCH_TOKEN%"',
    '--data-urlencode "worktreeId=%ORCA_WORKTREE_ID%"',
    '--data-urlencode "env=%ORCA_AGENT_HOOK_ENV%"',
    '--data-urlencode "version=%ORCA_AGENT_HOOK_VERSION%"',
    ...(options.extraFormFields ?? []),
    '--data-urlencode "payload@-"',
    options.discardResponse === false ? '2>nul' : '>nul 2>&1'
  ].join(' ')
}
