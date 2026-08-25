import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const ENVIRONMENT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['environment', 'add'],
    summary: 'Save a remote BarkOS runtime environment from a pairing code',
    usage: 'barkos environment add --name <name> --pairing-code <code> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name'],
    examples: ['barkos environment add --name work-laptop --pairing-code barkos://pair?code=...']
  },
  {
    path: ['environment', 'list'],
    summary: 'List saved BarkOS runtime environments',
    usage: 'barkos environment list [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['environment', 'show'],
    summary: 'Show one saved BarkOS runtime environment',
    usage: 'barkos environment show --environment <selector> [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['environment', 'rm'],
    destructive: true,
    summary: 'Remove one saved BarkOS runtime environment',
    usage: 'barkos environment rm --environment <selector> [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  }
]
