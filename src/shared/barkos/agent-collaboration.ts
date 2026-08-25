import { z } from 'zod'

export const BARKOS_AGENT_COLLABORATION_VERSION = 1 as const
export const BARKOS_AGENT_MAX_MESSAGE_HOPS = 4

const idSchema = z.string().trim().min(1).max(256)

export const barkosAgentCollaborationEnvelopeSchema = z
  .object({
    version: z.literal(BARKOS_AGENT_COLLABORATION_VERSION),
    envelopeId: idSchema,
    conversationId: idSchema,
    inReplyTo: idSchema.nullable(),
    act: z.enum(['inform', 'request', 'query', 'propose', 'agree', 'refuse', 'handoff']),
    fromWorkerId: idSchema,
    toWorkerId: idSchema.nullable(),
    taskId: idSchema.nullable(),
    dispatchId: idSchema.nullable(),
    subject: z.string().trim().min(1).max(240),
    body: z.string().trim().min(1).max(8_000),
    requiresReply: z.boolean(),
    hop: z.number().int().min(0).max(BARKOS_AGENT_MAX_MESSAGE_HOPS),
    createdAt: z.number().int().nonnegative()
  })
  .strict()
  .superRefine((envelope, context) => {
    if (envelope.act === 'query' && !envelope.requiresReply) {
      context.addIssue({
        code: 'custom',
        message: 'BarkOS query messages must require a reply',
        path: ['requiresReply']
      })
    }
    if (envelope.hop > 0 && envelope.inReplyTo === null) {
      context.addIssue({
        code: 'custom',
        message: 'Forwarded BarkOS messages must reference their parent',
        path: ['inReplyTo']
      })
    }
  })

export type BarkosAgentCollaborationEnvelope = z.infer<
  typeof barkosAgentCollaborationEnvelopeSchema
>

export function parseBarkosAgentCollaborationEnvelope(
  value: unknown
): BarkosAgentCollaborationEnvelope {
  return barkosAgentCollaborationEnvelopeSchema.parse(value)
}

export function encodeBarkosAgentCollaborationEnvelope(
  envelope: BarkosAgentCollaborationEnvelope
): string {
  return JSON.stringify(parseBarkosAgentCollaborationEnvelope(envelope))
}

export function forwardBarkosAgentCollaborationEnvelope(args: {
  envelope: BarkosAgentCollaborationEnvelope
  envelopeId: string
  fromWorkerId: string
  toWorkerId: string | null
  body?: string
  now?: number
}): BarkosAgentCollaborationEnvelope {
  const source = parseBarkosAgentCollaborationEnvelope(args.envelope)
  if (source.hop >= BARKOS_AGENT_MAX_MESSAGE_HOPS) {
    throw new Error('BarkOS ajan mesajı aktarım sınırına ulaştı')
  }
  return parseBarkosAgentCollaborationEnvelope({
    ...source,
    envelopeId: args.envelopeId,
    inReplyTo: source.envelopeId,
    fromWorkerId: args.fromWorkerId,
    toWorkerId: args.toWorkerId,
    body: args.body ?? source.body,
    hop: source.hop + 1,
    createdAt: args.now ?? Date.now()
  })
}

export function barkosCollaborationMessageType(
  envelope: BarkosAgentCollaborationEnvelope
): 'handoff' | 'question' | 'status' {
  if (envelope.act === 'handoff') {
    return 'handoff'
  }
  return envelope.requiresReply ? 'question' : 'status'
}

export function barkosAgentCollaborationInstructions(workerId: string): string {
  return [
    'Ajan haberleşme protokolü:',
    `- Gönderen çalışan kimliğin: ${workerId}.`,
    '- Kalıcı BarkOS orkestrasyon posta kutusunu kullan; terminal metnini çalışanlar arası iletişim kanalı sayma.',
    '- Soru için question, bağlam ve sorumluluk aktarımı için handoff, ilerleme için status mesajı gönder.',
    '- payload içinde version, envelopeId, conversationId, inReplyTo, act, fromWorkerId, toWorkerId, taskId, dispatchId, subject, body, requiresReply, hop ve createdAt alanlarını koru.',
    `- hop ${BARKOS_AGENT_MAX_MESSAGE_HOPS} değerine ulaştığında aktarmayı bırak ve baş ajana karar sorusu gönder.`,
    '- Görev tamamlamayı yalnız worker_done ile bildir; status mesajı görevi tamamlamaz.'
  ].join('\n')
}
