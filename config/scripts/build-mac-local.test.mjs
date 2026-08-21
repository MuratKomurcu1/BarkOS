import { describe, expect, it } from 'vitest'
import { createLocalBuildVersion, getLocalMacArchitecture } from './build-mac-local.mjs'

describe('createLocalBuildVersion', () => {
  it('creates unique valid prerelease versions without changing the release base', () => {
    expect(createLocalBuildVersion('1.4.159-rc.0', 123456, 'abc123')).toBe(
      '1.4.159-rc.0.local.123456.abc123'
    )
    expect(createLocalBuildVersion('1.4.159', 123456, 'abc123')).toBe('1.4.159-local.123456.abc123')
  })

  it('sanitizes commit identifiers', () => {
    expect(createLocalBuildVersion('1.0.0', 1, 'abc/def')).toBe('1.0.0-local.1.abcdef')
  })
})

describe('getLocalMacArchitecture', () => {
  it('packages only the architecture used by the local Mac', () => {
    expect(getLocalMacArchitecture('arm64')).toBe('arm64')
    expect(getLocalMacArchitecture('x64')).toBe('x64')
  })

  it('rejects unsupported local architectures', () => {
    expect(() => getLocalMacArchitecture('ia32')).toThrow(
      'Unsupported local macOS architecture: ia32'
    )
  })
})
