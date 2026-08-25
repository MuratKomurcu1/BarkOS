import { describe, expect, it } from 'vitest'
import {
  BARKOS_AGENT_MAX_MESSAGE_HOPS,
  barkosCollaborationMessageType,
  forwardBarkosAgentCollaborationEnvelope,
  parseBarkosAgentCollaborationEnvelope
} from './agent-collaboration'

function envelope(hop = 0) {
  return parseBarkosAgentCollaborationEnvelope({
    version: 1,
    envelopeId: `message-${hop}`,
    conversationId: 'conversation-1',
    inReplyTo: hop > 0 ? `message-${hop - 1}` : null,
    act: 'query',
    fromWorkerId: 'atlas',
    toWorkerId: 'lead',
    taskId: 'task-1',
    dispatchId: 'dispatch-1',
    subject: 'Karar gerekli',
    body: 'Hangi uyumluluk hedefi kullanılmalı?',
    requiresReply: true,
    hop,
    createdAt: 1
  })
}

describe('BarkOS ajan haberleşme sözleşmesi', () => {
  it('yanıt isteyen sorguyu orkestrasyon sorusuna eşler', () => {
    expect(barkosCollaborationMessageType(envelope())).toBe('question')
  })

  it('aktarımı izlenebilir üst mesajla sınırlar', () => {
    const forwarded = forwardBarkosAgentCollaborationEnvelope({
      envelope: envelope(),
      envelopeId: 'message-1',
      fromWorkerId: 'lead',
      toWorkerId: 'worker-2',
      now: 2
    })
    expect(forwarded).toMatchObject({ hop: 1, inReplyTo: 'message-0' })
    expect(() =>
      forwardBarkosAgentCollaborationEnvelope({
        envelope: envelope(BARKOS_AGENT_MAX_MESSAGE_HOPS),
        envelopeId: 'overflow',
        fromWorkerId: 'lead',
        toWorkerId: 'worker-2'
      })
    ).toThrow('aktarım sınırına')
  })
})
