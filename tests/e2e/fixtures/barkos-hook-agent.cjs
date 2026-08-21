#!/usr/bin/env node

const { spawnSync } = require('node:child_process')

const prompt = process.argv.at(-1) ?? ''

async function emitHookStatus(eventName, statusPrompt) {
  const port = process.env.ORCA_AGENT_HOOK_PORT
  const token = process.env.ORCA_AGENT_HOOK_TOKEN
  const paneKey = process.env.ORCA_PANE_KEY
  const launchToken = process.env.ORCA_AGENT_LAUNCH_TOKEN
  if (!port || !token || !paneKey || !launchToken) {
    process.stderr.write('BARKOS_E2E_HOOK_ENV_MISSING\n')
    return
  }
  const response = await fetch(`http://127.0.0.1:${port}/hook/codex`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Orca-Agent-Hook-Token': token
    },
    body: JSON.stringify({
      paneKey,
      tabId: process.env.ORCA_TAB_ID,
      worktreeId: process.env.ORCA_WORKTREE_ID,
      env: process.env.ORCA_AGENT_HOOK_ENV,
      version: process.env.ORCA_AGENT_HOOK_VERSION,
      launchToken,
      payload: {
        hook_event_name: eventName,
        ...(eventName === 'UserPromptSubmit'
          ? { prompt: statusPrompt }
          : { last_assistant_message: 'BarkOS görevi için hazır.' })
      }
    })
  })
  if (response.status !== 204) {
    process.stderr.write(`BARKOS_E2E_HOOK_REJECTED_${response.status}\n`)
  }
}

process.stdout.write(
  '\u001b]0;Codex Ready\u0007OpenAI Codex\nmodel: barkos-e2e\ndirectory: barkos-e2e\nBARKOS_E2E_AGENT_READY\n'
)
void emitHookStatus('Stop', prompt).catch((error) => {
    process.stderr.write(`BARKOS_E2E_HOOK_ERROR_${String(error)}\n`)
})

let input = ''
let completionReported = false
let taskReported = false
let taskSubmitted = false
let pendingTaskPrompt = ''

function lastMatch(text, pattern) {
  return Array.from(text.matchAll(pattern)).at(-1)?.[1] ?? null
}

function completeAssignedTask(taskPrompt, encodedCompletion) {
  if (completionReported) {
    return
  }
  const cliEntry = process.env.ORCA_E2E_CLI_ENTRY
  const terminalHandle = lastMatch(taskPrompt, /--from\s+(term_[A-Za-z0-9_-]+)/g)
  const capability = lastMatch(taskPrompt, /--dispatch-capability\s+(dcap_[A-Za-z0-9_-]+)/g)
  const taskId = lastMatch(taskPrompt, /--task-id\s+([A-Za-z0-9_-]+)/g)
  const dispatchId = lastMatch(taskPrompt, /--dispatch-id\s+([A-Za-z0-9_-]+)/g)
  if (!cliEntry || !terminalHandle || !capability || !taskId || !dispatchId) {
    process.stderr.write('BARKOS_E2E_COMPLETION_AUTHORITY_MISSING\n')
    return
  }
  completionReported = true
  const completion = JSON.parse(Buffer.from(encodedCompletion, 'base64').toString('utf8'))
  const args = [
    'orchestration',
    'send',
    '--from',
    terminalHandle,
    '--dispatch-capability',
    capability,
    '--type',
    'worker_done',
    '--subject',
    completion.subject,
    '--body',
    completion.body,
    '--task-id',
    taskId,
    '--dispatch-id',
    dispatchId,
    '--outcome',
    'succeeded',
    '--files-modified',
    completion.filesModified.join(','),
    '--report-path',
    completion.reportPath,
    ...(completion.staffingProposal
      ? ['--staffing-proposal-json', JSON.stringify(completion.staffingProposal)]
      : []),
    '--json'
  ]
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    env: process.env,
    encoding: 'utf8'
  })
  process.stdout.write(`\nBARKOS_E2E_COMPLETION_STATUS_${result.status}\n${result.stdout}`)
  if (result.stderr) {
    process.stderr.write(result.stderr)
  }
}

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
}
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  input = `${input}${String(chunk)}`.slice(-24_000)
  const ansiEscapePattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, 'g')
  const taskPrompt = input.replaceAll(ansiEscapePattern, '')
  const reachedTaskEnd = [
    'Projeyi değiştirmeden incele',
    'Proje analistinin raporunu ve tamamlanma mesajını incele',
    'Kullanıcı isteğini proje kurallarına uygun biçimde uygula'
  ].some((marker) => taskPrompt.includes(marker))
  if (!taskReported && reachedTaskEnd) {
    taskReported = true
    pendingTaskPrompt = taskPrompt
  }
  if (taskReported && !taskSubmitted && chunk.includes('\r')) {
    taskSubmitted = true
    process.stdout.write('\u001b]0;Codex working\u0007')
    void emitHookStatus('UserPromptSubmit', pendingTaskPrompt).catch((error) => {
      process.stderr.write(`BARKOS_E2E_TASK_HOOK_ERROR_${String(error)}\n`)
    })
  }
  const completionMarker = lastMatch(taskPrompt, /BARKOS_E2E_COMPLETE:([A-Za-z0-9+/=]+)/g)
  if (completionMarker && chunk.includes('\r')) {
    completeAssignedTask(taskPrompt, completionMarker)
  }
})
process.stdin.resume()

const keepAlive = setInterval(() => {}, 1_000)
function stop() {
  clearInterval(keepAlive)
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
