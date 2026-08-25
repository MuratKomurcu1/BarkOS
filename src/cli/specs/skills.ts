import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const SKILL_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['skills', 'installed'],
    summary: 'List installed skill selectors',
    usage: 'barkos skills installed [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Lists discovery IDs and names without reading skill contents into the CLI.',
      'Package metadata is validated when the selected skills are shared.',
      'Use an exact ID or an unambiguous name with `barkos skills share --skill <selector>`.'
    ]
  },
  {
    path: ['skills', 'share'],
    summary: 'Publish explicitly selected installed skills behind one unlisted link',
    usage:
      'barkos skills share --skill <selector> [--skill <selector> ...] --bundle-name <name> ' +
      '[--release-notes <text>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'skill', 'bundle-name', 'release-notes'],
    notes: [
      'Requires the default-off permission in Settings → Share Skills.',
      'The bundle name may be human-readable; BarkOS converts it to a portable lowercase package name.',
      'Selectors are exact discovery IDs or unambiguous names from `barkos skills installed`.',
      'Only discovered skill directories can be selected; arbitrary paths and --all are not supported.',
      'The resulting link is unlisted. Anyone with it can inspect and install the bundle.'
    ],
    examples: [
      'barkos skills share --skill frontend --bundle-name "Frontend Skills"',
      'barkos skills share --skill frontend --skill testing --bundle-name "Team Toolkit" --json'
    ]
  },
  {
    path: ['skills', 'list'],
    summary: 'List version-matched skill guides bundled with this BarkOS CLI',
    usage: 'barkos skills list [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Reads bundled guide metadata locally without contacting the BarkOS runtime.',
      'With --json, prints a topics array of canonical names and one-line descriptions.',
      'Use `barkos skills get <name>` for the full guide, or `barkos skills install` to install skills.'
    ]
  },
  {
    path: ['skills', 'get'],
    aliases: [['skills', 'show']],
    summary: 'Print a version-matched skill guide as Markdown',
    usage: 'barkos skills get <topic> [--full] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'topic', 'full'],
    positionalArgs: ['topic'],
    notes: [
      'Reads bundled guide content locally without contacting the BarkOS runtime.',
      'Use --full to include bundled reference documents when the guide provides them.',
      'Use --json for a deterministic object containing canonical topic metadata and content.'
    ],
    examples: ['barkos skills get barkos-cli', 'barkos skills get orchestration --full']
  },
  {
    path: ['skills', 'install'],
    summary: 'Install bundled BarkOS skills directly from the local registry',
    usage:
      'barkos skills install [--skill <name>]... [--all] [--agent <name>[,<name>]] ' +
      '[--local] [--dry-run] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'skill', 'all', 'agent', 'local', 'dry-run'],
    notes: [
      'Writes the skill guides embedded in this binary straight into agent skill ' +
        'directories. No network access and no external skills CLI are involved.',
      'Installs globally (agent homes under your user directory) by default. Use --local to ' +
        'install into the current project instead.',
      'Targets the coding agents BarkOS detects on this host, plus the shared ' +
        '.agents/skills directory.',
      'Use --agent <name>[,<name>...] to choose targets yourself, or --agent universal ' +
        'for the shared directory alone. Required when BarkOS detects no agent.',
      'Use --dry-run to print the planned target paths without writing anything.',
      'With --json, every outcome (including real installs) emits a deterministic object.',
      'Omit --skill and --all to list installable skill names.',
      'Intended for headless hosts (SSH, containers, CI) with no desktop Settings UI to copy the install command from.'
    ],
    examples: [
      'barkos skills install',
      'barkos skills install --skill barkos-cli --skill orchestration',
      'barkos skills install --skill barkos-cli --local',
      'barkos skills install --skill barkos-cli --agent claude-code,codex',
      'barkos skills install --all --dry-run'
    ]
  },
  {
    path: ['skills', 'update'],
    summary: 'Refresh already-installed BarkOS skills from the bundled registry',
    usage: 'barkos skills update [--skill <name>]... [--all] [--local] [--dry-run] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'skill', 'all', 'local', 'dry-run'],
    notes: [
      'Overwrites installed copies whose content drifted from the skill guides ' +
        'embedded in this binary. Skills that are not installed are reported and skipped.',
      'Updates the global install (agent homes under your user directory) by default. ' +
        'Use --local to refresh the current project instead.',
      'Use --dry-run to print the planned target paths without writing anything.',
      'With --json, every outcome emits a deterministic object.',
      'Omit --skill and --all to list updatable skill names.',
      'Intended for headless hosts (SSH, containers, CI) with no desktop Settings UI to copy the update command from.'
    ],
    examples: [
      'barkos skills update',
      'barkos skills update --skill barkos-cli --skill orchestration',
      'barkos skills update --skill barkos-cli --local',
      'barkos skills update --all --dry-run'
    ]
  }
]
