import { describe, expect, it } from 'vitest'
import { getBarkosToolInputSha256 } from './side-effect-tool-identity'

describe('BarkOS side-effect tool identity', () => {
  it('is stable across object key ordering while preserving tool identity', () => {
    const left = getBarkosToolInputSha256('Bash', {
      command: 'git push origin main',
      metadata: { cwd: '/repo', timeout: 30 }
    })
    const reordered = getBarkosToolInputSha256('Bash', {
      metadata: { timeout: 30, cwd: '/repo' },
      command: 'git push origin main'
    })

    expect(reordered).toBe(left)
    expect(
      getBarkosToolInputSha256('OtherTool', {
        command: 'git push origin main',
        metadata: { cwd: '/repo', timeout: 30 }
      })
    ).not.toBe(left)
  })
})
