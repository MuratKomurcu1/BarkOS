import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const outputRoots = ['out/cli', 'out/shared', 'out/bin', 'out/electron-dev']

await Promise.all(
  outputRoots.map((relativePath) => rm(resolve(relativePath), { recursive: true, force: true }))
)
