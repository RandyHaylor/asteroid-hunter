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
  /** D38: stab-chord voice (semitone offsets from A4 played together), or null for no stab */
  chordSemitoneOffsetsFromA4: number[] | null
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
      chordSemitoneOffsetsFromA4: null,
      kickDrumHit: kickStepIndices.has(stepIndex),
      hatDrumHit: hatStepIndices.has(stepIndex),
      snareDrumHit: snareStepIndices.has(stepIndex),
    })
  }
  return loopSteps
}

// ===== D38: a library of longer, more complex multi-bar techno tracks =====
// These are original genre-faithful compositions (acid 16th basslines, four-on-the-floor kicks,
// offbeat hats, chord stabs, arps, and per-bar variation/fills) — NOT transcriptions of copyrighted
// records. The engine plays a track for several loops, then rotates to the next for variety.

export type TechnoBar = TechnoLoopStep[] // exactly LOOP_STEP_COUNT steps
export type TechnoTrack = {
  name: string
  beatsPerMinute: number
  bars: TechnoBar[]
}

const N = null
// semitone offsets from A4 used below (negative = below A4)
const A2 = -24, C3 = -21, E3 = -17, G3 = -14, A3 = -12, D3 = -19, F3 = -16
const A4n = 0, C5 = 3, D5 = 5, E5 = 7, G5 = 10, A5 = 12, B4 = 2
// chord stabs (A natural-minor harmony): i, VI, III, VII
const Am = [A4n, C5, E5], Fmaj = [-4, A4n, C5], Cmaj = [C5, E5, G5], Gmaj = [-2, B4, D5], Dm = [D3 + 12, F3 + 12, A4n]

function buildBar(
  bassSemitones: (number | null)[],
  leadSemitones: (number | null)[],
  chordStabs: (number[] | null)[],
  kickStepList: number[],
  hatStepList: number[],
  snareStepList: number[],
): TechnoBar {
  const kicks = new Set(kickStepList)
  const hats = new Set(hatStepList)
  const snares = new Set(snareStepList)
  const bar: TechnoBar = []
  for (let stepIndex = 0; stepIndex < LOOP_STEP_COUNT; stepIndex++) {
    bar.push({
      bassSemitoneOffsetFromA4: bassSemitones[stepIndex] ?? null,
      leadSemitoneOffsetFromA4: leadSemitones[stepIndex] ?? null,
      chordSemitoneOffsetsFromA4: chordStabs[stepIndex] ?? null,
      kickDrumHit: kicks.has(stepIndex),
      hatDrumHit: hats.has(stepIndex),
      snareDrumHit: snares.has(stepIndex),
    })
  }
  return bar
}

const FOUR_ON_THE_FLOOR = [0, 4, 8, 12]
const OFFBEAT_HATS = [2, 6, 10, 14]
const ALL_HATS = [2, 3, 6, 7, 10, 11, 14, 15]
const BACKBEAT = [4, 12]

// --- Track 1: "Acid Drive" — driving 16th acid bassline, sparse arp, stabs on the 4 chords ---
const acidDriveMainBar = buildBar(
  [A2, A2, A3, A2, E3, A2, A3, G3, A2, A2, C3, A2, E3, A2, G3, A2],
  [A5, N, E5, N, N, C5, N, E5, N, A5, N, G5, N, E5, N, N],
  [Am, N, N, N, Fmaj, N, N, N, Cmaj, N, N, N, Gmaj, N, N, N],
  FOUR_ON_THE_FLOOR, OFFBEAT_HATS, BACKBEAT,
)
const acidDriveFillBar = buildBar(
  [A2, A2, A3, G3, E3, G3, A3, A2, A2, C3, E3, G3, A3, C3, E3, A3],
  [A5, A5, E5, C5, A5, G5, E5, C5, A5, A5, E5, C5, E5, G5, A5, A5],
  [Am, N, N, N, N, N, N, N, Gmaj, N, N, N, Gmaj, N, Gmaj, N],
  [0, 4, 8, 12, 14], ALL_HATS, [4, 12, 15],
)
const acidDriveTrack: TechnoTrack = {
  name: 'Acid Drive',
  beatsPerMinute: 130,
  bars: [acidDriveMainBar, acidDriveMainBar, acidDriveMainBar, acidDriveFillBar],
}

// --- Track 2: "Rave Stabs" — rolling bass + classic offbeat rave chord stabs + hoover lead ---
const raveMainBar = buildBar(
  [A2, N, A2, A2, N, A2, A2, N, A2, N, A2, A2, N, A2, A2, N],
  [N, E5, N, A5, N, E5, N, C5, N, E5, N, A5, N, G5, N, E5],
  [N, N, Am, N, N, N, Cmaj, N, N, N, Fmaj, N, N, N, Gmaj, N],
  FOUR_ON_THE_FLOOR, ALL_HATS, BACKBEAT,
)
const raveLiftBar = buildBar(
  [A2, N, A2, A2, N, A2, A2, N, C3, N, C3, C3, N, E3, E3, N],
  [A5, B4 + 12, C5 + 12, N, E5 + 5, N, C5 + 12, N, A5, N, G5, N, E5, N, C5, N],
  [Am, N, Am, N, Cmaj, N, Cmaj, N, Fmaj, N, Fmaj, N, Gmaj, N, Gmaj, N],
  [0, 4, 8, 10, 12], ALL_HATS, [4, 12],
)
const raveStabsTrack: TechnoTrack = {
  name: 'Rave Stabs',
  beatsPerMinute: 138,
  bars: [raveMainBar, raveMainBar, raveLiftBar, raveMainBar],
}

// --- Track 3: "Deep Dark" — sparse dub-techno: heavy kick, long chord, minimal bass/lead ---
const deepDarkMainBar = buildBar(
  [A2, N, N, N, N, N, A2, N, A2, N, N, N, N, N, N, N],
  [N, N, N, N, A4n, N, N, N, N, N, N, N, E5, N, N, N],
  [Am, N, N, N, N, N, N, N, Dm, N, N, N, N, N, N, N],
  FOUR_ON_THE_FLOOR, OFFBEAT_HATS, [12],
)
const deepDarkBreakBar = buildBar(
  [A2, N, N, N, F3, N, N, N, G3, N, N, N, E3, N, N, N],
  [N, N, A4n, N, N, N, C5, N, N, N, E5, N, N, N, D5, N],
  [Fmaj, N, N, N, N, N, N, N, Gmaj, N, N, N, N, N, N, N],
  [0, 4, 8, 12], OFFBEAT_HATS, [4, 12],
)
const deepDarkTrack: TechnoTrack = {
  name: 'Deep Dark',
  beatsPerMinute: 124,
  bars: [deepDarkMainBar, deepDarkMainBar, deepDarkMainBar, deepDarkBreakBar],
}

/** D38: the rotation of complex multi-bar techno tracks the music engine cycles through. */
export const TECHNO_TRACKS: readonly TechnoTrack[] = [acidDriveTrack, raveStabsTrack, deepDarkTrack]
