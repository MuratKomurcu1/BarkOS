import { z } from 'zod'
import { barkosEntityIdSchema } from './company'
import { containsBarkosCredentialLikeContent } from './memory-content-policy'
import { BARKOS_MAX_MEMORY_IDS_PER_DELIVERY } from './work-ledger'

export const barkosMemoryDispatchContextSchema = z
  .object({
    text: z.string().trim().min(1).max(8_000),
    selectedMemoryIds: z.array(barkosEntityIdSchema).min(1).max(BARKOS_MAX_MEMORY_IDS_PER_DELIVERY)
  })
  .strict()
  .superRefine((context, refinement) => {
    if (new Set(context.selectedMemoryIds).size !== context.selectedMemoryIds.length) {
      refinement.addIssue({
        code: 'custom',
        message: 'Memory dispatch context contains duplicate memory ids',
        path: ['selectedMemoryIds']
      })
    }
    if (containsBarkosCredentialLikeContent(context.text)) {
      refinement.addIssue({
        code: 'custom',
        message: 'Memory dispatch context contains credential-like content',
        path: ['text']
      })
    }
  })

export type BarkosMemoryDispatchContext = z.infer<typeof barkosMemoryDispatchContextSchema>

export async function sha256BarkosMemoryContext(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
