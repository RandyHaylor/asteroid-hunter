// D23: procedural 8-bit techno audio. This module holds the PURE, testable music theory — note
// frequencies, step timing, and the loop pattern data — with zero Web Audio dependency, so the
// pattern/timing math can be unit-tested headless. The Web Audio synthesis lives in
// proceduralGameAudio.ts and consumes the values produced here.

/** Standard concert pitch: A4 = 440 Hz, equal temperament (12 semitones per octave). */
const A4_FREQUENCY_HZ = 440

/** Convert a semitone offset relative to A4 into a frequency in Hz (12-TET). */
export function semitoneOffsetFromA4ToFrequencyHz(semitoneOffsetFromA4: number): number {
  return A4_FREQUENCY_HZ * Math.pow(2, semitoneOffsetFromA4 / 12)
}

/** The loop is one bar of sixteenth notes: 4 beats x 4 sixteenths. */
export const LOOP_STEP_COUNT = 16
export const TECHNO_TEMPO_BEATS_PER_MINUTE = 128
const SIXTEENTH_STEPS_PER_BEAT = 4

/** Real-time duration of a single sixteenth-note step at the techno tempo. */
export function loopStepDurationSeconds(
  beatsPerMinute: number = TECHNO_TEMPO_BEATS_PER_MINUTE,
): number {
  return 60 / beatsPerMinute / SIXTEENTH_STEPS_PER_BEAT
}

/**
 * One step of the looping pattern. Pitches are semitone offsets from A4; null = no note that step.
 * Drums are simple booleans flagged per step.
 */
export type TechnoLoopStep = {
  bassSemitoneOffsetFromA4: number | null
  leadSemitoneOffsetFromA4: number | null
  kickDrumHit: boolean
  hatDrumHit: boolean
  snareDrumHit: boolean
}

// A natural-minor groove rooted on A. Bass sits ~2 octaves below A4 (offset -24 = A2), the lead
// arpeggiates the A-minor triad an octave up. Four-on-the-floor kick, offbeat hats, backbeat snare.
const BASS_ROOT_A2 = -24
const BASS_FIFTH = BASS_ROOT_A2 + 7 // E3
const BASS_FLAT_SEVENTH = BASS_ROOT_A2 + 10 // G3
const LEAD_A4 = 0
const LEAD_C5 = 3
const LEAD_E5 = 7

const bassRiffSemitones: (number | null)[] = [
  BASS_ROOT_A2, null, BASS_ROOT_A2, null,
  BASS_FIFTH, null, BASS_ROOT_A2, null,
  BASS_FLAT_SEVENTH, null, BASS_FLAT_SEVENTH, null,
  BASS_FIFTH, null, BASS_ROOT_A2, BASS_FIFTH,
]

const leadArpeggioSemitones: (number | null)[] = [
  LEAD_A4, null, LEAD_E5, null,
  LEAD_C5, null, LEAD_E5, null,
  LEAD_A4, null, LEAD_E5, null,
  LEAD_C5, LEAD_E5, LEAD_C5, null,
]

const kickStepIndices = new Set([0, 4, 8, 12])
const snareStepIndices = new Set([4, 12])
const hatStepIndices = new Set([2, 6, 10, 14])

/** The fixed one-bar techno loop, indexed 0..LOOP_STEP_COUNT-1. */
export function buildTechnoLoopPattern(): TechnoLoopStep[] {
  const loopSteps: TechnoLoopStep[] = []
  for (let stepIndex = 0; stepIndex < LOOP_STEP_COUNT; stepIndex++) {
    loopSteps.push({
      bassSemitoneOffsetFromA4: bassRiffSemitones[stepIndex],
      leadSemitoneOffsetFromA4: leadArpeggioSemitones[stepIndex],
      kickDrumHit: kickStepIndices.has(stepIndex),
      hatDrumHit: hatStepIndices.has(stepIndex),
      snareDrumHit: snareStepIndices.has(stepIndex),
    })
  }
  return loopSteps
}
