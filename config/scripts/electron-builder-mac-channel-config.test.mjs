import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const electronBuilderConfig = require('../electron-builder.config.cjs')

const MUTABLE_BUILD_ENV = [
  'ORCA_MAC_HOURLY',
  'ORCA_MAC_DAILY',
  'ORCA_MAC_ADHOC',
  'ORCA_MAC_RELEASE',
  'ORCA_HOURLY_BUILD_VERSION',
  'ORCA_DAILY_BUILD_VERSION',
  'ORCA_ADHOC_BUILD_VERSION',
  'ORCA_LOCAL_BUILD_VERSION',
  'ORCA_LOCAL_BUILD_ARCH'
]

/** Re-requires the config under a temporary env, then restores env and module cache. */
function withEnv(env, assert) {
  const configPath = require.resolve('../electron-builder.config.cjs')
  const original = Object.fromEntries(MUTABLE_BUILD_ENV.map((key) => [key, process.env[key]]))
  try {
    for (const key of MUTABLE_BUILD_ENV) {
      delete process.env[key]
    }
    Object.assign(process.env, env)
    delete require.cache[configPath]
    assert(require('../electron-builder.config.cjs'))
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    delete require.cache[configPath]
    require('../electron-builder.config.cjs')
  }
}

const withHourlyEnv = (assert) => withEnv({ ORCA_MAC_HOURLY: '1' }, assert)
const withDailyEnv = (assert) => withEnv({ ORCA_MAC_DAILY: '1' }, assert)
const withAdhocEnv = (assert) => withEnv({ ORCA_MAC_ADHOC: '1' }, assert)

const expectBarkosPublishTarget = (config) => {
  expect(config.publish).toEqual([
    {
      provider: 'github',
      owner: 'MuratKomurcu1',
      repo: 'BarkOS',
      releaseType: 'draft'
    }
  ])
}

describe('electron-builder mac channel config', () => {
  it('builds hourly artifacts with the release signing identity', () => {
    withHourlyEnv((config) => {
      expect(config.mac.appId).toBeUndefined()
      expect(config.appId).toBe('com.barkos.desktop')
      expect(config.mac.hardenedRuntime).toBe(true)
      expect(config.mac.identity).toBeUndefined()
      expect(config.forceCodeSigning).toBe(true)
    })
  })

  // Why hourly must notarize despite the round trip: TCC anchors a notarized
  // Developer ID app's grants on identifier + team, not on its cdhash, so they
  // survive an update. An unnotarized hourly reads as a new client every build
  // and loses file access under Documents/Desktop/Downloads with no re-prompt.
  it('notarizes hourly builds like releases, and neither locally', () => {
    withHourlyEnv((config) => {
      expect(config.mac.notarize).toBe(true)
    })
    withEnv({ ORCA_MAC_RELEASE: '1' }, (config) => {
      expect(config.mac.notarize).toBe(true)
    })
    expect(electronBuilderConfig.mac.notarize).toBe(false)
    expect(electronBuilderConfig.mac.identity).toBe('-')
  })

  it('limits local builds to the host architecture', () => {
    withEnv({ ORCA_LOCAL_BUILD_ARCH: 'arm64' }, (config) => {
      expect(config.mac.target).toEqual([
        { target: 'dmg', arch: ['arm64'] },
        { target: 'zip', arch: ['arm64'] }
      ])
    })
  })

  it('publishes every BarkOS channel only to the BarkOS repository', () => {
    withHourlyEnv((config) => {
      expectBarkosPublishTarget(config)
    })
    withDailyEnv((config) => {
      expectBarkosPublishTarget(config)
    })
    withAdhocEnv((config) => {
      expectBarkosPublishTarget(config)
    })
    withEnv({ ORCA_MAC_RELEASE: '1' }, (config) => {
      expectBarkosPublishTarget(config)
    })
    expectBarkosPublishTarget(electronBuilderConfig)
  })

  it('stamps hourly packages with the hourly version', () => {
    withEnv(
      { ORCA_MAC_HOURLY: '1', ORCA_HOURLY_BUILD_VERSION: '1.4.160-hourly.202607281400' },
      (config) => {
        expect(config.extraMetadata).toEqual({ version: '1.4.160-hourly.202607281400' })
      }
    )
  })

  it('builds adhoc artifacts with the BarkOS release identity', () => {
    withAdhocEnv((config) => {
      expect(config.appId).toBe('com.barkos.desktop')
      expect(config.mac.hardenedRuntime).toBe(true)
      expect(config.mac.notarize).toBe(true)
      expect(config.forceCodeSigning).toBe(true)
      expectBarkosPublishTarget(config)
    })
  })

  it('stamps adhoc packages with the adhoc version', () => {
    withEnv(
      { ORCA_MAC_ADHOC: '1', ORCA_ADHOC_BUILD_VERSION: '1.4.160-adhoc.20260728140533' },
      (config) => {
        expect(config.extraMetadata).toEqual({ version: '1.4.160-adhoc.20260728140533' })
      }
    )
  })

  it('builds daily artifacts with the BarkOS release identity', () => {
    withDailyEnv((config) => {
      expect(config.appId).toBe('com.barkos.desktop')
      expect(config.mac.hardenedRuntime).toBe(true)
      expect(config.mac.notarize).toBe(true)
      expect(config.forceCodeSigning).toBe(true)
      expectBarkosPublishTarget(config)
    })
  })

  it('stamps daily packages with the daily version', () => {
    withEnv(
      { ORCA_MAC_DAILY: '1', ORCA_DAILY_BUILD_VERSION: '1.4.160-daily.202607281300' },
      (config) => {
        expect(config.extraMetadata).toEqual({ version: '1.4.160-daily.202607281300' })
      }
    )
  })
})
