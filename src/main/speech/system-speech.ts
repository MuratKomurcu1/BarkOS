import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

type SystemSpeechCommand = {
  command: string
  args: string[]
  input: 'argument' | 'stdin'
}

let activeSpeech: ChildProcessWithoutNullStreams | null = null

const WINDOWS_SPEECH_SCRIPT = [
  '$text = [Console]::In.ReadToEnd()',
  'Add-Type -AssemblyName System.Speech',
  '$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer',
  "$culture = [System.Globalization.CultureInfo]::GetCultureInfo('tr-TR')",
  'try { $speaker.SelectVoiceByHints(0, 0, 0, $culture) } catch {}',
  '$speaker.Speak($text)'
].join('; ')

export function getSystemSpeechCommands(
  platform: NodeJS.Platform,
  locale?: string
): SystemSpeechCommand[] {
  const turkish = locale?.toLowerCase().startsWith('tr') === true
  if (platform === 'darwin') {
    return turkish
      ? [{ command: '/usr/bin/say', args: ['-v', 'Yelda'], input: 'stdin' }]
      : [{ command: '/usr/bin/say', args: [], input: 'stdin' }]
  }
  if (platform === 'win32') {
    return [
      {
        command: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_SPEECH_SCRIPT],
        input: 'stdin'
      }
    ]
  }
  if (platform === 'linux') {
    const language = turkish ? 'tr' : 'en'
    return [
      { command: 'spd-say', args: ['--wait', '--language', language], input: 'argument' },
      { command: 'espeak-ng', args: ['--stdin', '-v', language], input: 'stdin' },
      { command: 'espeak', args: ['--stdin', '-v', language], input: 'stdin' }
    ]
  }
  return []
}

function runSpeechCommand(command: SystemSpeechCommand, text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const args = command.input === 'argument' ? [...command.args, text] : command.args
    const child = spawn(command.command, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let settled = false
    activeSpeech = child
    const finish = (success: boolean): void => {
      if (settled) {
        return
      }
      settled = true
      if (activeSpeech === child) {
        activeSpeech = null
      }
      resolve(success)
    }
    child.once('error', () => finish(false))
    child.once('close', (code) => finish(code === 0))
    if (command.input === 'stdin') {
      child.stdin.end(text)
    } else {
      child.stdin.end()
    }
  })
}

export async function speakWithSystemVoice(text: string, locale?: string): Promise<boolean> {
  cancelSystemSpeech()
  for (const command of getSystemSpeechCommands(process.platform, locale)) {
    if (await runSpeechCommand(command, text)) {
      return true
    }
  }
  return false
}

export function cancelSystemSpeech(): void {
  activeSpeech?.kill()
  activeSpeech = null
}
