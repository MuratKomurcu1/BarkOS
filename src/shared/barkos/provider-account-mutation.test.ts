import { describe, expect, it } from 'vitest'
import {
  classifyBarkosProviderAccountMutation,
  resolveBarkosProviderConversationMode
} from './provider-account-mutation'

describe('BarkOS provider account mutation evidence', () => {
  it('accepts only an exact mutation response or authoritative readback', () => {
    expect(
      classifyBarkosProviderAccountMutation({
        requestedAccountId: 'account-b',
        mutation: 'returned',
        responseActiveAccountId: 'account-b'
      })
    ).toEqual({ status: 'applied', evidence: 'mutation-response' })
    expect(
      classifyBarkosProviderAccountMutation({
        requestedAccountId: 'account-b',
        mutation: 'threw',
        readbackActiveAccountId: 'account-b'
      })
    ).toEqual({ status: 'applied', evidence: 'authoritative-readback' })
  })

  it('distinguishes a proven miss from an ambiguous mutation', () => {
    expect(
      classifyBarkosProviderAccountMutation({
        requestedAccountId: 'account-b',
        mutation: 'threw',
        readbackActiveAccountId: 'account-a'
      })
    ).toEqual({ status: 'not-applied', evidence: 'authoritative-readback' })
    expect(
      classifyBarkosProviderAccountMutation({
        requestedAccountId: 'account-b',
        mutation: 'threw'
      })
    ).toEqual({ status: 'uncertain', evidence: 'missing-readback' })
    expect(
      classifyBarkosProviderAccountMutation({
        requestedAccountId: 'account-b',
        mutation: 'returned',
        responseActiveAccountId: 'account-a'
      })
    ).toEqual({ status: 'uncertain', evidence: 'inconsistent-response' })
  })

  it('requires an exact readback when the mutation boundary requests it', () => {
    expect(
      classifyBarkosProviderAccountMutation({
        requestedAccountId: 'account-b',
        mutation: 'returned',
        responseActiveAccountId: 'account-b',
        readbackActiveAccountId: 'account-b',
        requireAuthoritativeReadback: true
      })
    ).toEqual({ status: 'applied', evidence: 'authoritative-readback' })
    expect(
      classifyBarkosProviderAccountMutation({
        requestedAccountId: 'account-b',
        mutation: 'returned',
        responseActiveAccountId: 'account-b',
        requireAuthoritativeReadback: true
      })
    ).toEqual({ status: 'uncertain', evidence: 'missing-readback' })
    expect(
      classifyBarkosProviderAccountMutation({
        requestedAccountId: 'account-b',
        mutation: 'returned',
        responseActiveAccountId: 'account-b',
        readbackActiveAccountId: 'account-a',
        requireAuthoritativeReadback: true
      })
    ).toEqual({ status: 'uncertain', evidence: 'inconsistent-response' })
    expect(
      classifyBarkosProviderAccountMutation({
        requestedAccountId: 'account-b',
        mutation: 'returned',
        responseActiveAccountId: 'account-a',
        readbackActiveAccountId: 'account-a',
        requireAuthoritativeReadback: true
      })
    ).toEqual({ status: 'not-applied', evidence: 'authoritative-readback' })
  })

  it('supports Codex resume metadata and falls back honestly', () => {
    expect(
      resolveBarkosProviderConversationMode({
        provider: 'codex',
        agent: 'codex',
        providerSession: { key: 'session_id', id: 'session-one' }
      })
    ).toBe('same-conversation')
    expect(resolveBarkosProviderConversationMode({ provider: 'codex', agent: 'codex' })).toBe(
      'new-session'
    )
    expect(resolveBarkosProviderConversationMode({ provider: 'claude', agent: 'claude' })).toBe(
      'unsupported'
    )
  })
})
