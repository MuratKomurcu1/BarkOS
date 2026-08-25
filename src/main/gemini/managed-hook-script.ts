import { buildWindowsAgentHookCurlPostCommand } from '../agent-hooks/installer-utils'
import {
  buildPosixHookPayloadCapture,
  buildWindowsHookEnvironmentGuardLines,
  buildWindowsHookStdinDrainEpilogue
} from '../agent-hooks/hook-stdin-contract'

const BARKOS_ENFORCEMENT_FIELD = 'barkosSideEffectEnforcement'
const BARKOS_TRANSPORT_DENIAL = JSON.stringify({
  decision: 'deny',
  reason: 'BarkOS approval service is unavailable; the side effect was blocked.'
})

function windowsMissingContextGuards(): string[] {
  return [
    `if "%ORCA_AGENT_HOOK_PORT%"=="" if "%ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT%"=="1" (echo ${BARKOS_TRANSPORT_DENIAL} & exit /b 0)`,
    `if "%ORCA_AGENT_HOOK_TOKEN%"=="" if "%ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT%"=="1" (echo ${BARKOS_TRANSPORT_DENIAL} & exit /b 0)`,
    `if "%ORCA_PANE_KEY%"=="" if "%ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT%"=="1" (echo ${BARKOS_TRANSPORT_DENIAL} & exit /b 0)`
  ]
}

export function getGeminiManagedHookScript(target: 'local' | 'posix' = 'local'): string {
  if (target === 'local' && process.platform === 'win32') {
    return [
      '@echo off',
      'setlocal',
      'if defined ORCA_AGENT_HOOK_ENDPOINT if exist "%ORCA_AGENT_HOOK_ENDPOINT%" call "%ORCA_AGENT_HOOK_ENDPOINT%" 2>nul',
      ...windowsMissingContextGuards(),
      ...buildWindowsHookEnvironmentGuardLines({ neutralJson: true }),
      buildWindowsAgentHookCurlPostCommand('gemini', {
        discardResponse: false,
        failOnHttpError: true,
        extraFormFields: [
          `--data-urlencode "${BARKOS_ENFORCEMENT_FIELD}=%ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT%"`
        ]
      }),
      `if errorlevel 1 if "%ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT%"=="1" (echo ${BARKOS_TRANSPORT_DENIAL} & exit /b 0)`,
      'if errorlevel 1 echo {}',
      'exit /b 0',
      ...buildWindowsHookStdinDrainEpilogue(),
      ''
    ].join('\r\n')
  }

  return [
    '#!/bin/sh',
    ...buildPosixHookPayloadCapture(),
    'is_before_tool() {',
    '  printf \'%s\' "$payload" | grep -Eq \'"hook_event_name"[[:space:]]*:[[:space:]]*"BeforeTool"\'',
    '}',
    'if [ -n "$ORCA_AGENT_HOOK_ENDPOINT" ] && [ -r "$ORCA_AGENT_HOOK_ENDPOINT" ]; then',
    '  . "$ORCA_AGENT_HOOK_ENDPOINT" 2>/dev/null || :',
    'fi',
    'deny_barkos_transport_loss() {',
    `  printf '%s\\n' '${BARKOS_TRANSPORT_DENIAL}'`,
    '  exit 0',
    '}',
    'if [ -z "$ORCA_AGENT_HOOK_PORT" ] || [ -z "$ORCA_AGENT_HOOK_TOKEN" ] || [ -z "$ORCA_PANE_KEY" ]; then',
    '  if [ "$ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT" = "1" ] && is_before_tool; then',
    '    deny_barkos_transport_loss',
    '  fi',
    '  printf "{}\\n"',
    '  exit 0',
    'fi',
    'hook_max_time=1.5',
    'if [ "$ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT" = "1" ]; then hook_max_time=8; fi',
    'response=$(printf \'%s\' "$payload" | curl -fsS -X POST "http://127.0.0.1:${ORCA_AGENT_HOOK_PORT}/hook/gemini" \\',
    '  --connect-timeout 0.5 --max-time "$hook_max_time" \\',
    '  --noproxy "127.0.0.1" \\',
    '  -H "Content-Type: application/x-www-form-urlencoded" \\',
    '  -H "X-BarkOS-Agent-Hook-Token: ${ORCA_AGENT_HOOK_TOKEN}" \\',
    '  --data-urlencode "paneKey=${ORCA_PANE_KEY}" \\',
    '  --data-urlencode "tabId=${ORCA_TAB_ID}" \\',
    '  --data-urlencode "launchToken=${ORCA_AGENT_LAUNCH_TOKEN}" \\',
    '  --data-urlencode "worktreeId=${ORCA_WORKTREE_ID}" \\',
    '  --data-urlencode "env=${ORCA_AGENT_HOOK_ENV}" \\',
    '  --data-urlencode "version=${ORCA_AGENT_HOOK_VERSION}" \\',
    `  --data-urlencode "${BARKOS_ENFORCEMENT_FIELD}=\${ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT}" \\`,
    '  --data-urlencode "payload@-" 2>/dev/null) || response=',
    'if [ -n "$response" ]; then',
    '  printf "%s\\n" "$response"',
    'elif [ "$ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT" = "1" ] && is_before_tool; then',
    '  deny_barkos_transport_loss',
    'else',
    '  printf "{}\\n"',
    'fi',
    'exit 0',
    ''
  ].join('\n')
}
