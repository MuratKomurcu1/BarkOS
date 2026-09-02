import { describe, expect, it } from 'vitest'
import { getSystemSpeechCommands } from './system-speech'

describe('system speech commands', () => {
  it('uses only the Turkish macOS voice for Turkish speech', () => {
    expect(getSystemSpeechCommands('darwin', 'tr-TR')).toEqual([
      { command: '/usr/bin/say', args: ['-v', 'Yelda'], input: 'stdin' }
    ])
  })

  it('uses the Windows system speech synthesizer without interpolating user text', () => {
    const commands = getSystemSpeechCommands('win32', 'tr-TR')
    expect(commands).toHaveLength(1)
    expect(commands[0]).toMatchObject({ command: 'powershell.exe', input: 'stdin' })
  })

  it('falls back through common Linux speech tools', () => {
    expect(getSystemSpeechCommands('linux', 'tr-TR').map(({ command }) => command)).toEqual([
      'spd-say',
      'espeak-ng',
      'espeak'
    ])
  })
})
