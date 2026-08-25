import { buildWindowsAgentHookCurlPostCommand } from '../agent-hooks/installer-utils'
import {
  buildPosixHookPayloadCapture,
  buildWindowsHookEnvironmentGuardLines,
  buildWindowsHookStdinDrainEpilogue
} from '../agent-hooks/hook-stdin-contract'

const BARKOS_ENFORCEMENT_FIELD = 'barkosSideEffectEnforcement'
const BARKOS_TRANSPORT_DENIAL = JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: 'BarkOS approval service is unavailable; the side effect was blocked.'
  }
})

function windowsMissingContextGuards(): string[] {
  return [
    `if "%ORCA_AGENT_HOOK_PORT%"=="" if "%ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT%"=="1" (echo ${BARKOS_TRANSPORT_DENIAL} & exit /b 0)`,
    `if "%ORCA_AGENT_HOOK_TOKEN%"=="" if "%ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT%"=="1" (echo ${BARKOS_TRANSPORT_DENIAL} & exit /b 0)`,
    `if "%ORCA_PANE_KEY%"=="" if "%ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT%"=="1" (echo ${BARKOS_TRANSPORT_DENIAL} & exit /b 0)`
  ]
}

export function getCodexManagedHookScript(target: 'local' | 'posix' = 'local'): string {
  if (target === 'local' && process.platform === 'win32') {
    return [
      '@echo off',
      'setlocal',
      // Why: refresh endpoint coordinates for PTYs surviving an Orca restart.
      'if defined ORCA_AGENT_HOOK_ENDPOINT if exist "%ORCA_AGENT_HOOK_ENDPOINT%" call "%ORCA_AGENT_HOOK_ENDPOINT%" 2>nul',
      ...windowsMissingContextGuards(),
      ...buildWindowsHookEnvironmentGuardLines(),
      buildWindowsAgentHookCurlPostCommand('codex', {
        discardResponse: false,
        failOnHttpError: true,
        extraFormFields: [
          `--data-urlencode "${BARKOS_ENFORCEMENT_FIELD}=%ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT%"`
        ]
      }),
      `if errorlevel 1 if "%ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT%"=="1" (echo ${BARKOS_TRANSPORT_DENIAL} & exit /b 0)`,
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
    // Why: refresh endpoint coordinates for PTYs surviving an Orca restart.
    'load_hook_endpoint() {',
    '  endpoint_path="$1"',
    '  case "$endpoint_path" in',
    '    *.cmd)',
    '      endpoint_cr=$(printf "\\r")',
    '      while IFS= read -r endpoint_line || [ -n "$endpoint_line" ]; do',
    '        endpoint_line=${endpoint_line%"$endpoint_cr"}',
    '        case "$endpoint_line" in',
    '          "set ORCA_AGENT_HOOK_PORT="*) ORCA_AGENT_HOOK_PORT=${endpoint_line#*=} ;;',
    '          "set ORCA_AGENT_HOOK_TOKEN="*) ORCA_AGENT_HOOK_TOKEN=${endpoint_line#*=} ;;',
    '          "set ORCA_AGENT_HOOK_ENV="*) ORCA_AGENT_HOOK_ENV=${endpoint_line#*=} ;;',
    '          "set ORCA_AGENT_HOOK_VERSION="*) ORCA_AGENT_HOOK_VERSION=${endpoint_line#*=} ;;',
    '        esac',
    '      done < "$endpoint_path"',
    '      ;;',
    '    *)',
    '      . "$endpoint_path" 2>/dev/null || :',
    '      ;;',
    '  esac',
    '}',
    'if [ -n "$ORCA_AGENT_HOOK_ENDPOINT" ] && [ -r "$ORCA_AGENT_HOOK_ENDPOINT" ]; then',
    '  load_hook_endpoint "$ORCA_AGENT_HOOK_ENDPOINT"',
    'fi',
    'deny_barkos_transport_loss() {',
    `  printf '%s\\n' '${BARKOS_TRANSPORT_DENIAL}'`,
    '  exit 0',
    '}',
    'if [ -z "$ORCA_AGENT_HOOK_PORT" ] || [ -z "$ORCA_AGENT_HOOK_TOKEN" ] || [ -z "$ORCA_PANE_KEY" ]; then',
    '  if [ "$ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT" = "1" ] && is_pre_tool_use; then',
    '    deny_barkos_transport_loss',
    '  fi',
    '  exit 0',
    'fi',
    'post_codex_hook() {',
    '  curl_bin="$1"',
    '  connect_timeout="${2:-0.5}"',
    '  max_time="${3:-1.5}"',
    '  printf \'%s\' "$payload" | "$curl_bin" -fsS -X POST "http://127.0.0.1:${ORCA_AGENT_HOOK_PORT}/hook/codex" \\',
    '    --connect-timeout "$connect_timeout" --max-time "$max_time" \\',
    '    --noproxy "127.0.0.1" \\',
    '    -H "Content-Type: application/x-www-form-urlencoded" \\',
    '    -H "X-BarkOS-Agent-Hook-Token: ${ORCA_AGENT_HOOK_TOKEN}" \\',
    '    --data-urlencode "paneKey=${ORCA_PANE_KEY}" \\',
    '    --data-urlencode "tabId=${ORCA_TAB_ID}" \\',
    '    --data-urlencode "launchToken=${ORCA_AGENT_LAUNCH_TOKEN}" \\',
    '    --data-urlencode "worktreeId=${ORCA_WORKTREE_ID}" \\',
    '    --data-urlencode "env=${ORCA_AGENT_HOOK_ENV}" \\',
    '    --data-urlencode "version=${ORCA_AGENT_HOOK_VERSION}" \\',
    `    --data-urlencode "${BARKOS_ENFORCEMENT_FIELD}=\${ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT}" \\`,
    '    --data-urlencode "payload@-"',
    '}',
    'is_wsl_runtime() {',
    '  [ -n "$WSL_DISTRO_NAME" ] && return 0',
    '  grep -qiE "microsoft|wsl" /proc/sys/kernel/osrelease /proc/version 2>/dev/null',
    '}',
    'hook_max_time=1.5',
    'if [ "$ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT" = "1" ]; then hook_max_time=8; fi',
    'response=',
    'if response=$(post_codex_hook curl 0.5 "$hook_max_time" 2>/dev/null); then',
    '  :',
    'elif is_wsl_runtime; then',
    '  windows_curl=$(command -v curl.exe 2>/dev/null || true)',
    '  if [ -n "$windows_curl" ] && [ -x "$windows_curl" ]; then',
    '    response=$(post_codex_hook "$windows_curl" 3 "$hook_max_time" 2>/dev/null) || response=',
    '  fi',
    'fi',
    'if [ -n "$response" ]; then',
    '  printf "%s\\n" "$response"',
    'elif [ "$ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT" = "1" ] && is_pre_tool_use; then',
    '  deny_barkos_transport_loss',
    'fi',
    'exit 0',
    ''
  ].join('\n')
}
