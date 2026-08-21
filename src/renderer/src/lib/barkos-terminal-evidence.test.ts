import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readBarkosTerminalEvidenceSnapshot } from './barkos-terminal-evidence'

const { subscribeTerminal } = vi.hoisted(() => ({ subscribeTerminal: vi.fn() }))

vi.mock('../runtime/remote-runtime-terminal-multiplexer', () => ({
  getRemoteRuntimeTerminalMultiplexer: () => ({ subscribeTerminal })
}))

beforeEach(() => {
  subscribeTerminal.mockReset()
  vi.stubGlobal('window', {
    api: {
      pty: {
        getMainBufferSnapshot: vi.fn().mockResolvedValue({ data: 'local output' })
      }
    }
  })
})

describe('BarkOS terminal evidence snapshot', () => {
  it('reads a bounded local or SSH PTY snapshot without writing input', async () => {
    await expect(readBarkosTerminalEvidenceSnapshot('pty-local')).resolves.toBe('local output')
    expect(window.api.pty.getMainBufferSnapshot).toHaveBeenCalledWith('pty-local', {
      scrollbackRows: 120
    })
    expect(subscribeTerminal).not.toHaveBeenCalled()
  })

  it('uses a temporary read-only stream for a paired runtime terminal', async () => {
    const close = vi.fn()
    const serializeBuffer = vi.fn().mockResolvedValue({ data: 'remote output' })
    subscribeTerminal.mockResolvedValue({ close, serializeBuffer })

    await expect(readBarkosTerminalEvidenceSnapshot('remote:paired-1@@terminal-1')).resolves.toBe(
      'remote output'
    )

    expect(serializeBuffer).toHaveBeenCalledWith({ scrollbackRows: 120 })
    expect(close).toHaveBeenCalledOnce()
  })
})
