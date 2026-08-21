import type { FeatureInteractionState } from '../../../../shared/feature-interactions'
import { hasFeatureInteraction } from '../../../../shared/feature-interactions'
import {
  FEATURE_WALL_SETUP_STEPS,
  type FeatureWallSetupStepId
} from '../../../../shared/feature-wall-setup-steps'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { Worktree } from '../../../../shared/worktree/types'

export type FeatureWallSetupProgressInput = {
  ready?: boolean
  settings: GlobalSettings | null
  detectedTuiAgents: readonly TuiAgent[]
  featureInteractions: FeatureInteractionState
  hasConnectedTaskSource: boolean
  browserUseSkillInstalled: boolean
  computerUseSkillInstalled: boolean
  computerUsePermissionsReady: boolean
  computerUseUnavailable?: boolean
  orchestrationSkillInstalled: boolean
  gitRepoCount: number
  worktreesByRepo: Record<string, Worktree[]>
  hasSetupScript: boolean
}

export type FeatureWallSetupProgress = {
  ready: boolean
  stepDone: Record<FeatureWallSetupStepId, boolean>
  coreDoneCount: number
  coreTotal: number
}

function countAvailableNonMainWorktrees(worktreesByRepo: Record<string, Worktree[]>): number {
  // Why: imported git worktrees count as real parallel-work capacity, but
  // partially hydrated placeholders can appear before a worktree path is known.
  return Object.values(worktreesByRepo).reduce(
    (sum, worktrees) =>
      sum +
      worktrees.filter(
        (worktree) => !worktree.isMainWorktree && typeof worktree.path === 'string' && worktree.path
      ).length,
    0
  )
}

export function getFeatureWallSetupProgress(
  input: FeatureWallSetupProgressInput
): FeatureWallSetupProgress {
  const agentCapabilitiesDone =
    input.browserUseSkillInstalled &&
    input.computerUseSkillInstalled &&
    (input.computerUsePermissionsReady || input.computerUseUnavailable === true) &&
    input.orchestrationSkillInstalled
  // Why: a saved preference alone is not proof the agent can actually run
  // (handoff #9: VS Code-only codex was counted as done). The step completes
  // only when the chosen CLI is really detected on this machine's PATH.
  const savedDefaultTuiAgent = input.settings?.defaultTuiAgent ?? null
  const stepDone: Record<FeatureWallSetupStepId, boolean> = {
    'default-agent':
      savedDefaultTuiAgent !== null &&
      savedDefaultTuiAgent !== 'blank' &&
      input.detectedTuiAgents.includes(savedDefaultTuiAgent),
    'add-two-repos': input.gitRepoCount >= 2,
    notifications:
      input.settings?.notifications?.enabled === true &&
      input.settings.notifications?.agentTaskComplete === true,
    'two-worktrees': countAvailableNonMainWorktrees(input.worktreesByRepo) >= 1,
    // Why: the 'browser' interaction fires when a non-blank page is viewed, so
    // opening any real page in Orca's browser durably completes this milestone.
    browser: hasFeatureInteraction(input.featureInteractions, 'browser'),
    'task-sources': input.hasConnectedTaskSource,
    'agent-capabilities': agentCapabilitiesDone,
    'setup-script': input.hasSetupScript
  }
  return {
    ready: input.ready ?? true,
    stepDone,
    coreDoneCount: FEATURE_WALL_SETUP_STEPS.filter((step) => stepDone[step.id]).length,
    coreTotal: FEATURE_WALL_SETUP_STEPS.length
  }
}
