// D103: the built-in PRE-WAVE-1 INTRO ("tutorial") sequence (pre-wave-1-intro-sequence.md). A scripted
// timeline that demonstrates the ship's systems before the first wave: radar icons start hidden; the
// ship is aimed at an asteroid (collision in a couple seconds) so the auto-avoidance fires; then a brief
// auto-grapple shows the orbit/redirect; finally the radar icons flash 3× and become live. The CALLER
// places the ship + asteroid and gates wave-1/manual-control; this module only drives the TIMELINE
// (status messages, icon visibility, auto-grapple on/off) via injected hooks, so it stays pure-ish and
// the timings live in one readable place.

export type PreWaveOneIntroHooks = {
  logStatusMessage(message: string): void
  setRadarIconsHidden(hidden: boolean): void
  beginAutoGrappleNearestAsteroid(): void
  releaseAutoGrapple(): void
}

export type PreWaveOneIntroSequence = {
  /** begin the sequence (caller has already placed the ship/asteroid + hidden manual control) */
  start(): void
  /** advance the timeline; fires due steps. Safe to call when inactive (no-op). */
  update(deltaSeconds: number): void
  /** true while the intro is playing (caller holds wave-1 + manual control off until this clears) */
  isActive(): boolean
}

type IntroStep = { atSeconds: number; run: (hooks: PreWaveOneIntroHooks) => void }

// the scripted timeline (seconds from start). Icons flash on/off three times at a 0.5s cadence, then
// stay on. The sequence ends right after the icons settle on.
const INTRO_STEPS: readonly IntroStep[] = [
  { atSeconds: 0.0, run: (h) => { h.setRadarIconsHidden(true); h.logStatusMessage('Grappling tractor beam online.') } },
  { atSeconds: 1.0, run: (h) => h.logStatusMessage('Grappling tractor auto-deployed — avoiding collision.') },
  // wait a couple extra seconds after the grazing pass before the orbit test (D110)
  { atSeconds: 5.0, run: (h) => { h.logStatusMessage('Testing asteroid orbit system...'); h.beginAutoGrappleNearestAsteroid() } },
  { atSeconds: 7.0, run: (h) => { h.releaseAutoGrapple(); h.logStatusMessage('System check: trajectory redirection confirmed. Manual control online.') } },
  // radar icons flash on/off ×3 (0.5s cadence), then stay on
  { atSeconds: 7.0, run: (h) => h.setRadarIconsHidden(false) },
  { atSeconds: 7.5, run: (h) => h.setRadarIconsHidden(true) },
  { atSeconds: 8.0, run: (h) => h.setRadarIconsHidden(false) },
  { atSeconds: 8.5, run: (h) => h.setRadarIconsHidden(true) },
  { atSeconds: 9.0, run: (h) => h.setRadarIconsHidden(false) },
  { atSeconds: 9.5, run: (h) => h.setRadarIconsHidden(true) },
  { atSeconds: 10.0, run: (h) => h.setRadarIconsHidden(false) },
]
const INTRO_TOTAL_SECONDS = 10.0

export function createPreWaveOneIntroSequence(hooks: PreWaveOneIntroHooks): PreWaveOneIntroSequence {
  let isActive = false
  let elapsedSeconds = 0
  let nextStepIndex = 0

  return {
    start(): void {
      isActive = true
      elapsedSeconds = 0
      nextStepIndex = 0
    },
    update(deltaSeconds: number): void {
      if (!isActive) return
      elapsedSeconds += deltaSeconds
      while (nextStepIndex < INTRO_STEPS.length && INTRO_STEPS[nextStepIndex].atSeconds <= elapsedSeconds) {
        INTRO_STEPS[nextStepIndex].run(hooks)
        nextStepIndex += 1
      }
      if (elapsedSeconds >= INTRO_TOTAL_SECONDS) {
        hooks.setRadarIconsHidden(false) // make sure they end ON
        isActive = false
      }
    },
    isActive(): boolean {
      return isActive
    },
  }
}
