import { buildWindowsAgentHookCurlPostCommand } from '../agent-hooks/installer-utils'
import {
  buildPosixHookPayloadCapture,
  buildWindowsHookEnvironmentGuardLines,
  buildWindowsHookStdinDrainEpilogue,
  WINDOWS_HOOK_STDIN_DRAIN_LABEL
} from '../agent-hooks/hook-stdin-contract'

export function getClaudeManagedHookScript(
  target: 'local' | 'posix' = 'local',
  options: { skipWhenDevinImportsClaude?: boolean } = {}
): string {
  if (target === 'local' && process.platform === 'win32') {
    return [
      '@echo off',
      'setlocal',
      // Why: refresh endpoint coordinates for PTYs surviving an Orca restart.
      'if defined ORCA_AGENT_HOOK_ENDPOINT if exist "%ORCA_AGENT_HOOK_ENDPOINT%" call "%ORCA_AGENT_HOOK_ENDPOINT%" 2>nul',
      // Why (#11549): the env guards must outrank the Devin skip — the Devin skip parks in more.com,
      // and outside an Orca pane the caller can abandon stdin, so more.com never returns.
      ...buildWindowsHookEnvironmentGuardLines({ neutralJson: true }),
      ...(options.skipWhenDevinImportsClaude
        ? [
            // Why: Devin imports .claude hooks by default; skip Orca's managed hook there so status posts stay attributed to Devin.
            `if not "%DEVIN_PROJECT_DIR%"=="" (echo {} & goto :${WINDOWS_HOOK_STDIN_DRAIN_LABEL})`
          ]
        : []),
      buildWindowsAgentHookCurlPostCommand('claude', {
        discardResponse: false,
        failOnHttpError: true,
        extraFormFields: [
          '--data-urlencode "barkosSideEffectEnforcement=%ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT%"'
        ]
      }),
      'if errorlevel 1 if "%ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT%"=="1" (echo BarkOS approval service is unavailable; side effect blocked. 1>&2 & exit /b 2)',
      'if errorlevel 1 echo {}',
      'exit /b 0',
      ...buildWindowsHookStdinDrainEpilogue(),
      ''
    ].join('\r\n')
  }

  return [
    '#!/bin/sh',
    ...buildPosixHookPayloadCapture(),
    'is_pre_tool_use() {',
    '  printf \'%s\' "$payload" | grep -Eq \'"hook_event_name"[[:space:]]*:[[:space:]]*"PreToolUse"\'',
    '}',
    ...(options.skipWhenDevinImportsClaude
      ? [
          // Why: Devin imports .claude hooks by default; skip Orca's managed hook there so status posts stay attributed to Devin.
          'if [ -n "$DEVIN_PROJECT_DIR" ]; then',
          '  printf "{}\\n"',
          '  exit 0',
          'fi'
        ]
      : []),
    // Why: refresh endpoint coordinates for PTYs surviving an Orca restart.
    // Why: suppress parse errors so they neither leak nor trip outer set -e.
    'if [ -n "$ORCA_AGENT_HOOK_ENDPOINT" ] && [ -r "$ORCA_AGENT_HOOK_ENDPOINT" ]; then',
    '  . "$ORCA_AGENT_HOOK_ENDPOINT" 2>/dev/null || :',
    'fi',
    'if [ -z "$ORCA_AGENT_HOOK_PORT" ] || [ -z "$ORCA_AGENT_HOOK_TOKEN" ] || [ -z "$ORCA_PANE_KEY" ]; then',
    '  if [ "$ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT" = "1" ] && is_pre_tool_use; then',
    '    printf "%s\\n" "BarkOS approval service is unavailable; side effect blocked." >&2',
    '    exit 2',
    '  fi',
    '  printf "{}\\n"',
    '  exit 0',
    'fi',
    'hook_max_time=1.5',
    'if [ "$ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT" = "1" ]; then hook_max_time=8; fi',
    // Why: form fields keep paths safe while stdin keeps large payloads off the command line.
    'response=$(printf \'%s\' "$payload" | curl -sS -X POST "http://127.0.0.1:${ORCA_AGENT_HOOK_PORT}/hook/claude" \\',
    '  --connect-timeout 0.5 --max-time "$hook_max_time" \\',
    '  -H "Content-Type: application/x-www-form-urlencoded" \\',
    '  -H "X-Orca-Agent-Hook-Token: ${ORCA_AGENT_HOOK_TOKEN}" \\',
    '  --data-urlencode "paneKey=${ORCA_PANE_KEY}" \\',
    '  --data-urlencode "tabId=${ORCA_TAB_ID}" \\',
    '  --data-urlencode "launchToken=${ORCA_AGENT_LAUNCH_TOKEN}" \\',
    '  --data-urlencode "worktreeId=${ORCA_WORKTREE_ID}" \\',
    '  --data-urlencode "env=${ORCA_AGENT_HOOK_ENV}" \\',
    '  --data-urlencode "version=${ORCA_AGENT_HOOK_VERSION}" \\',
    '  --data-urlencode "barkosSideEffectEnforcement=${ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT}" \\',
    '  --data-urlencode "payload@-" 2>/dev/null) || response=',
    'if [ -n "$response" ]; then',
    '  printf "%s\\n" "$response"',
    'elif [ "$ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT" = "1" ] && is_pre_tool_use; then',
    '  printf "%s\\n" "BarkOS approval service is unavailable; side effect blocked." >&2',
    '  exit 2',
    'else',
    '  printf "{}\\n"',
    'fi',
    'exit 0',
    ''
  ].join('\n')
}
