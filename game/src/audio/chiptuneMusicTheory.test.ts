import { describe, expect, it } from 'vitest'
import {
  LOOP_STEP_COUNT,
  TECHNO_TEMPO_BEATS_PER_MINUTE,
  buildTechnoLoopPattern,
  loopStepDurationSeconds,
  semitoneOffsetFromA4ToFrequencyHz,
} from './chiptuneMusicTheory'

describe('semitoneOffsetFromA4ToFrequencyHz', () => {
  it('returns 440 Hz at the A4 reference (offset 0)', () => {
    expect(semitoneOffsetFromA4ToFrequencyHz(0)).toBeCloseTo(440, 6)
  })

  it('doubles frequency one octave up (+12 semitones) and halves one octave down', () => {
    expect(semitoneOffsetFromA4ToFrequencyHz(12)).toBeCloseTo(880, 6)
    expect(semitoneOffsetFromA4ToFrequencyHz(-12)).toBeCloseTo(220, 6)
  })

  it('puts A2 (offset -24) at 110 Hz', () => {
    expect(semitoneOffsetFromA4ToFrequencyHz(-24)).toBeCloseTo(110, 6)
  })
})

describe('loopStepDurationSeconds', () => {
  it('computes a sixteenth-note duration at 128 BPM', () => {
    // 60/128/4 = 0.1171875 s per sixteenth
    expect(loopStepDurationSeconds(TECHNO_TEMPO_BEATS_PER_MINUTE)).toBeCloseTo(0.1171875, 9)
  })

  it('scales inversely with tempo', () => {
    expect(loopStepDurationSeconds(60)).toBeCloseTo(0.25, 9) // 60/60/4
  })
})

describe('buildTechnoLoopPattern', () => {
  const pattern = buildTechnoLoopPattern()

  it('has exactly one bar of sixteenth steps', () => {
    expect(pattern).toHaveLength(LOOP_STEP_COUNT)
  })

  it('lays a four-on-the-floor kick on every beat (steps 0,4,8,12)', () => {
    const kickSteps = pattern.map((step, index) => (step.kickDrumHit ? index : -1)).filter((i) => i >= 0)
    expect(kickSteps).toEqual([0, 4, 8, 12])
  })

  it('puts the snare on the backbeat (steps 4,12)', () => {
    const snareSteps = pattern.map((step, index) => (step.snareDrumHit ? index : -1)).filter((i) => i >= 0)
    expect(snareSteps).toEqual([4, 12])
  })

  it('starts the bass on the root A2 (offset -24) at step 0', () => {
    expect(pattern[0].bassSemitoneOffsetFromA4).toBe(-24)
  })
})
