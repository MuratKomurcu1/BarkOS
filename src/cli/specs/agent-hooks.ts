import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const AGENT_HOOK_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'hooks', 'prepare-codex'],
    summary: 'Repair BarkOS-managed Codex hook trust before a shell launch',
    usage: 'barkos agent hooks prepare-codex',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['agent', 'hooks', 'status'],
    summary: 'Show whether BarkOS-managed agent status hooks are enabled',
    usage: 'barkos agent hooks status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['barkos agent hooks status', 'barkos agent hooks status --json']
  },
  {
    path: ['agent', 'hooks', 'off'],
    summary: 'Disable BarkOS-managed agent status hooks and remove local hook entries',
    usage: 'barkos agent hooks off [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['barkos agent hooks off']
  },
  {
    path: ['agent', 'hooks', 'on'],
    summary: 'Enable BarkOS-managed agent status hooks',
    usage: 'barkos agent hooks on [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['barkos agent hooks on']
  }
]
