import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { HomeSlide } from './slides/HomeSlide'
import { WorktreeListSlide } from './slides/WorktreeListSlide'
import { TerminalSlide } from './slides/TerminalSlide'
import { translate } from '@/i18n/i18n'

const DWELL_MS = 4500
const TAP_BEFORE_PUSH_MS = 240

type Phase = 'normal' | 'reset'

export function PhoneCarousel(): React.JSX.Element {
  const [activeIdx, setActiveIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('normal')
  const [tappingSlide, setTappingSlide] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      return
    }

    let activeSlide = 0
    let tapTimer: ReturnType<typeof setTimeout> | null = null
    let advanceTimer: ReturnType<typeof setTimeout> | null = null
    let resetTimer: ReturnType<typeof setTimeout> | null = null

    const dwellTimer = setInterval(() => {
      if (activeSlide < 2) {
        setTappingSlide(activeSlide)
        tapTimer = setTimeout(() => setTappingSlide(null), 320)
        advanceTimer = setTimeout(() => {
          activeSlide += 1
          setActiveIdx(activeSlide)
        }, TAP_BEFORE_PUSH_MS)
        return
      }
      setPhase('reset')
      setActiveIdx(0)
      activeSlide = 0
      resetTimer = setTimeout(() => setPhase('normal'), 30)
    }, DWELL_MS)

    return () => {
      clearInterval(dwellTimer)
      if (tapTimer) {
        clearTimeout(tapTimer)
      }
      if (advanceTimer) {
        clearTimeout(advanceTimer)
      }
      if (resetTimer) {
        clearTimeout(resetTimer)
      }
    }
  }, [])

  // Why: while the slide reset is in progress we want all slides to snap
  // back to their off-stage positions with no transition; the next render
  // tick removes is-reset so the subsequent push animates again.
  useEffect(() => {
    if (phase !== 'reset') {
      return
    }
    const id = requestAnimationFrame(() => {
      // force layout so the no-transition state takes effect before
      // transitions are re-enabled
      void containerRef.current?.offsetHeight
    })
    return () => cancelAnimationFrame(id)
  }, [phase])

  const slideClass = (idx: number): string =>
    cn(
      'mp-screen-slide',
      phase === 'reset' && 'is-reset',
      idx === activeIdx && 'is-active',
      idx < activeIdx && 'is-past'
    )

  return (
    <div className="mp-phone-frame">
      <div className="mp-phone-screen" ref={containerRef}>
        <div
          className={slideClass(0)}
          role="img"
          aria-label={translate(
            'auto.components.mobile.PhoneCarousel.89c7713645',
            'BarkOS Mobile home screen'
          )}
        >
          <HomeSlide tapping={tappingSlide === 0} />
        </div>
        <div
          className={slideClass(1)}
          role="img"
          aria-label={translate('auto.components.mobile.PhoneCarousel.93217b41c1', 'Worktree list')}
        >
          <WorktreeListSlide tapping={tappingSlide === 1} />
        </div>
        <div
          className={slideClass(2)}
          role="img"
          aria-label={translate(
            'auto.components.mobile.PhoneCarousel.96d651cb87',
            'Terminal session'
          )}
        >
          <TerminalSlide />
        </div>
      </div>
    </div>
  )
}
