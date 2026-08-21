import { parseRemoteRuntimePtyId } from '../../../shared/remote-runtime-pty-id'
import { BARKOS_EVIDENCE_TERMINAL_ROWS } from '../../../shared/barkos/evidence-capture'
import { getRemoteRuntimeTerminalMultiplexer } from '../runtime/remote-runtime-terminal-multiplexer'

export async function readBarkosTerminalEvidenceSnapshot(ptyId: string): Promise<string | null> {
  const remote = parseRemoteRuntimePtyId(ptyId)
  if (!remote?.environmentId) {
    const snapshot = await window.api.pty.getMainBufferSnapshot(ptyId, {
      scrollbackRows: BARKOS_EVIDENCE_TERMINAL_ROWS
    })
    return snapshot?.data ?? null
  }

  const stream = await getRemoteRuntimeTerminalMultiplexer(remote.environmentId).subscribeTerminal({
    terminal: remote.handle,
    client: { id: 'barkos-evidence-capture', type: 'desktop' },
    callbacks: {
      onData: () => undefined,
      onSnapshot: () => undefined,
      onSubscribed: () => undefined,
      onEnd: () => undefined,
      onError: () => undefined,
      onTransportClose: () => undefined
    }
  })
  try {
    const snapshot = await stream.serializeBuffer({
      scrollbackRows: BARKOS_EVIDENCE_TERMINAL_ROWS
    })
    return snapshot?.data ?? null
  } finally {
    stream.close()
  }
}
