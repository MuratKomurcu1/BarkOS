import type { ProjectExecutionRuntimeResolution } from '../../../shared/project-execution-runtime'

export type OrchestrationCliCommand = 'barkos' | 'orca' | 'orca-ide'

export function resolveTerminalOrchestrationCliCommand(args: {
  connectionId: string | null
  isWsl: boolean | null | undefined
  worktreeId: string
  projectRuntime?: ProjectExecutionRuntimeResolution
}): OrchestrationCliCommand {
  if (args.connectionId) {
    return 'orca'
  }
  return 'barkos'
}
