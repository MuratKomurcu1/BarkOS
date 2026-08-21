import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareCodexAccountFailoverResume } from './codex-account-failover-resume'

const roots: string[] = []
const SESSION_ID = '019f81b9-19a9-7651-a8d1-352d9420bd11'

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'barkos-codex-failover-'))
  roots.push(root)
  return root
}

function writeRollout(homePath: string): string {
  const filePath = join(
    homePath,
    'sessions',
    '2026',
    '08',
    '18',
    `rollout-2026-08-18T12-00-00-${SESSION_ID}.jsonl`
  )
  mkdirSync(join(filePath, '..'), { recursive: true })
  writeFileSync(filePath, '{"type":"session_meta"}\n')
  return filePath
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('prepareCodexAccountFailoverResume', () => {
  it('hardlinks one trusted rollout into the selected managed account home', () => {
    const root = tempRoot()
    const sourceHome = join(root, 'account-a')
    const targetHome = join(root, 'account-b')
    const sourcePath = writeRollout(sourceHome)

    const prepared = prepareCodexAccountFailoverResume({
      providerSession: { key: 'session_id', id: SESSION_ID, transcriptPath: sourcePath },
      targetCodexHomePath: targetHome,
      trustedCodexHomes: [sourceHome, targetHome]
    })

    expect(prepared).toEqual({
      key: 'session_id',
      id: SESSION_ID,
      transcriptPath: join(
        targetHome,
        'sessions',
        '2026',
        '08',
        '18',
        `rollout-2026-08-18T12-00-00-${SESSION_ID}.jsonl`
      )
    })
    expect(statSync(prepared.transcriptPath!).ino).toBe(statSync(sourcePath).ino)
  })

  it('rejects missing provenance and rollout paths outside trusted homes', () => {
    const root = tempRoot()
    const sourceHome = join(root, 'account-a')
    const targetHome = join(root, 'account-b')
    const untrustedPath = writeRollout(join(root, 'untrusted'))

    expect(() =>
      prepareCodexAccountFailoverResume({
        providerSession: { key: 'session_id', id: SESSION_ID },
        targetCodexHomePath: targetHome,
        trustedCodexHomes: [sourceHome, targetHome]
      })
    ).toThrow('verified rollout provenance')
    expect(() =>
      prepareCodexAccountFailoverResume({
        providerSession: { key: 'session_id', id: SESSION_ID, transcriptPath: untrustedPath },
        targetCodexHomePath: targetHome,
        trustedCodexHomes: [sourceHome, targetHome]
      })
    ).toThrow('unavailable or untrusted')
  })

  it('rejects an existing target rollout that is not the same physical log', () => {
    const root = tempRoot()
    const sourceHome = join(root, 'account-a')
    const targetHome = join(root, 'account-b')
    const sourcePath = writeRollout(sourceHome)
    writeRollout(targetHome)

    expect(() =>
      prepareCodexAccountFailoverResume({
        providerSession: { key: 'session_id', id: SESSION_ID, transcriptPath: sourcePath },
        targetCodexHomePath: targetHome,
        trustedCodexHomes: [sourceHome, targetHome]
      })
    ).toThrow('could not be linked')
  })
})
