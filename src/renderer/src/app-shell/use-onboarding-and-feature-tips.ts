import { useCallback, useState } from 'react'
import { shouldShowOnboarding } from '../components/onboarding/should-show-onboarding'
import { useAppStore } from '../store'
import type { OnboardingState } from '../../../shared/onboarding-state-types'

export type OnboardingGate = ReturnType<typeof useOnboardingAndFeatureTips>

/**
 * Routes new BarkOS profiles to company setup without inherited education modals.
 */
export function useOnboardingAndFeatureTips() {
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null)

  const applyStartupOnboardingState = useCallback((state: OnboardingState): void => {
    setOnboarding(state)
    if (shouldShowOnboarding(state)) {
      useAppStore.getState().setActiveView('company')
    }
  }, [])

  return {
    applyStartupOnboardingState,
    onboarding,
    setOnboarding,
    shouldRender: false
  }
}
