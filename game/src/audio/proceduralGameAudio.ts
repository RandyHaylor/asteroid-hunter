import {
  LOOP_STEP_COUNT,
  TECHNO_TRACKS,
  loopStepDurationSeconds,
  semitoneOffsetFromA4ToFrequencyHz,
  type TechnoLoopStep,
} from './chiptuneMusicTheory'

// D23: procedural 8-bit techno music + synthesized sound effects via the Web Audio API.
// No external audio files (A1) — every sound is generated from oscillators and noise at runtime.
// Browser autoplay policy: the AudioContext starts suspended and must be resumed from a user
// gesture (resumeAfterFirstUserGesture), so nothing plays until the player first interacts.

const MASTER_OUTPUT_GAIN = 0.5
const MUSIC_BUS_GAIN = 0.35
const SOUND_EFFECTS_BUS_GAIN = 0.6

// Web Audio lookahead scheduler ("A Tale of Two Clocks"): a coarse timer schedules precise
// AudioContext-timed events a little ahead of the playhead so timing never depends on JS jitter.
const SCHEDULER_TICK_MILLISECONDS = 25
const SCHEDULE_AHEAD_SECONDS = 0.12

export type GameAudioSystem = {
  /** Call from the first pointerdown/keydown — resumes the suspended context and starts the loop. */
  resumeAfterFirstUserGesture(): void
  /** Toggle master mute; returns the new muted state (for updating the HUD button label). */
  toggleMuted(): boolean
  isMuted(): boolean

  playLaserZapSound(): void
  playMissileLaunchSound(): void
  playEnemyHitSound(): void
  playExplosionSound(): void
  playPlayerHitSound(): void
  playWaveStartSound(): void
  playWaveClearedSound(): void
  playPlayerDestroyedSound(): void
}

/** A no-op audio system used when the Web Audio API is unavailable (keeps callers branch-free). */
function createSilentAudioSystem(): GameAudioSystem {
  return {
    resumeAfterFirstUserGesture() {},
    toggleMuted() {
      return false
    },
    isMuted() {
      return false
    },
    playLaserZapSound() {},
    playMissileLaunchSound() {},
    playEnemyHitSound() {},
    playExplosionSound() {},
    playPlayerHitSound() {},
    playWaveStartSound() {},
    playWaveClearedSound() {},
    playPlayerDestroyedSound() {},
  }
}

export function createGameAudioSystem(): GameAudioSystem {
  const AudioContextConstructor =
    typeof window !== 'undefined'
      ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined
  if (!AudioContextConstructor) return createSilentAudioSystem()

  const audioContext = new AudioContextConstructor()

  const masterGainNode = audioContext.createGain()
  masterGainNode.gain.value = MASTER_OUTPUT_GAIN
  masterGainNode.connect(audioContext.destination)

  const musicBusGainNode = audioContext.createGain()
  musicBusGainNode.gain.value = MUSIC_BUS_GAIN
  musicBusGainNode.connect(masterGainNode)

  const soundEffectsBusGainNode = audioContext.createGain()
  soundEffectsBusGainNode.gain.value = SOUND_EFFECTS_BUS_GAIN
  soundEffectsBusGainNode.connect(masterGainNode)

  // ===== one shared white-noise buffer, reused for every drum hit / noisy SFX =====
  const noiseBufferLengthSamples = Math.floor(audioContext.sampleRate * 1.0)
  const whiteNoiseBuffer = audioContext.createBuffer(1, noiseBufferLengthSamples, audioContext.sampleRate)
  const whiteNoiseChannel = whiteNoiseBuffer.getChannelData(0)
  // deterministic pseudo-noise (no Math.random) — a chaotic-but-fixed fill reads as white noise
  let noiseSeed = 0.123456789
  for (let sampleIndex = 0; sampleIndex < noiseBufferLengthSamples; sampleIndex++) {
    noiseSeed = (noiseSeed * 16807.0) % 1.0
    whiteNoiseChannel[sampleIndex] = noiseSeed * 2 - 1
  }

  // ===== low-level voice helpers =====

  function playOscillatorTone(
    destinationNode: AudioNode,
    oscillatorType: OscillatorType,
    startFrequencyHz: number,
    endFrequencyHz: number,
    startTimeSeconds: number,
    durationSeconds: number,
    peakGain: number,
  ): void {
    const oscillatorNode = audioContext.createOscillator()
    oscillatorNode.type = oscillatorType
    oscillatorNode.frequency.setValueAtTime(startFrequencyHz, startTimeSeconds)
    if (endFrequencyHz !== startFrequencyHz) {
      oscillatorNode.frequency.exponentialRampToValueAtTime(
        Math.max(1, endFrequencyHz),
        startTimeSeconds + durationSeconds,
      )
    }
    const envelopeGainNode = audioContext.createGain()
    envelopeGainNode.gain.setValueAtTime(0.0001, startTimeSeconds)
    envelopeGainNode.gain.exponentialRampToValueAtTime(peakGain, startTimeSeconds + 0.005)
    envelopeGainNode.gain.exponentialRampToValueAtTime(0.0001, startTimeSeconds + durationSeconds)
    oscillatorNode.connect(envelopeGainNode)
    envelopeGainNode.connect(destinationNode)
    oscillatorNode.start(startTimeSeconds)
    oscillatorNode.stop(startTimeSeconds + durationSeconds + 0.02)
  }

  function playNoiseBurst(
    destinationNode: AudioNode,
    startTimeSeconds: number,
    durationSeconds: number,
    peakGain: number,
    filterType: BiquadFilterType,
    filterFrequencyHz: number,
  ): void {
    const noiseSourceNode = audioContext.createBufferSource()
    noiseSourceNode.buffer = whiteNoiseBuffer
    const filterNode = audioContext.createBiquadFilter()
    filterNode.type = filterType
    filterNode.frequency.value = filterFrequencyHz
    const envelopeGainNode = audioContext.createGain()
    envelopeGainNode.gain.setValueAtTime(peakGain, startTimeSeconds)
    envelopeGainNode.gain.exponentialRampToValueAtTime(0.0001, startTimeSeconds + durationSeconds)
    noiseSourceNode.connect(filterNode)
    filterNode.connect(envelopeGainNode)
    envelopeGainNode.connect(destinationNode)
    noiseSourceNode.start(startTimeSeconds)
    noiseSourceNode.stop(startTimeSeconds + durationSeconds + 0.02)
  }

  // ===== drum voices =====

  function playKickDrumAtTime(startTimeSeconds: number): void {
    // sine punch with a fast downward pitch sweep = classic four-on-the-floor kick
    playOscillatorTone(musicBusGainNode, 'sine', 150, 50, startTimeSeconds, 0.16, 0.9)
  }
  function playHatDrumAtTime(startTimeSeconds: number): void {
    playNoiseBurst(musicBusGainNode, startTimeSeconds, 0.04, 0.25, 'highpass', 7000)
  }
  function playSnareDrumAtTime(startTimeSeconds: number): void {
    playNoiseBurst(musicBusGainNode, startTimeSeconds, 0.12, 0.4, 'bandpass', 1800)
  }

  // ===== D38: multi-bar, multi-track music scheduler =====
  // Plays a track for several full loops, then rotates to the next track for variety. Each step can
  // carry bass + lead + a chord stab; the step duration follows the current track's tempo.

  const TRACK_LOOPS_BEFORE_ROTATING = 4
  let currentTrackIndex = 0
  let currentBarIndex = 0
  let currentStepIndex = 0
  let currentTrackLoopsPlayed = 0
  let currentStepDurationSeconds = loopStepDurationSeconds(TECHNO_TRACKS[0].beatsPerMinute)
  let nextStepStartTimeSeconds = 0
  let musicSchedulerTimerId: ReturnType<typeof setInterval> | null = null

  function scheduleLoopStepAtTime(loopStep: TechnoLoopStep, startTimeSeconds: number): void {
    if (loopStep.kickDrumHit) playKickDrumAtTime(startTimeSeconds)
    if (loopStep.hatDrumHit) playHatDrumAtTime(startTimeSeconds)
    if (loopStep.snareDrumHit) playSnareDrumAtTime(startTimeSeconds)
    if (loopStep.bassSemitoneOffsetFromA4 !== null) {
      const bassFrequencyHz = semitoneOffsetFromA4ToFrequencyHz(loopStep.bassSemitoneOffsetFromA4)
      playOscillatorTone(musicBusGainNode, 'square', bassFrequencyHz, bassFrequencyHz, startTimeSeconds, currentStepDurationSeconds * 0.9, 0.5)
    }
    if (loopStep.leadSemitoneOffsetFromA4 !== null) {
      const leadFrequencyHz = semitoneOffsetFromA4ToFrequencyHz(loopStep.leadSemitoneOffsetFromA4)
      playOscillatorTone(musicBusGainNode, 'square', leadFrequencyHz, leadFrequencyHz, startTimeSeconds, currentStepDurationSeconds * 0.6, 0.16)
    }
    if (loopStep.chordSemitoneOffsetsFromA4) {
      // a short multi-note stab (each note quiet so the summed chord stays balanced)
      for (const chordSemitone of loopStep.chordSemitoneOffsetsFromA4) {
        const chordFrequencyHz = semitoneOffsetFromA4ToFrequencyHz(chordSemitone)
        playOscillatorTone(musicBusGainNode, 'square', chordFrequencyHz, chordFrequencyHz, startTimeSeconds, currentStepDurationSeconds * 1.4, 0.1)
      }
    }
  }

  function advanceToNextStep(): void {
    currentStepIndex++
    if (currentStepIndex < LOOP_STEP_COUNT) return
    currentStepIndex = 0
    currentBarIndex++
    if (currentBarIndex < TECHNO_TRACKS[currentTrackIndex].bars.length) return
    currentBarIndex = 0
    currentTrackLoopsPlayed++
    if (currentTrackLoopsPlayed < TRACK_LOOPS_BEFORE_ROTATING) return
    currentTrackLoopsPlayed = 0
    currentTrackIndex = (currentTrackIndex + 1) % TECHNO_TRACKS.length
    currentStepDurationSeconds = loopStepDurationSeconds(TECHNO_TRACKS[currentTrackIndex].beatsPerMinute)
  }

  function scheduleDueLoopSteps(): void {
    while (nextStepStartTimeSeconds < audioContext.currentTime + SCHEDULE_AHEAD_SECONDS) {
      const loopStep = TECHNO_TRACKS[currentTrackIndex].bars[currentBarIndex][currentStepIndex]
      scheduleLoopStepAtTime(loopStep, nextStepStartTimeSeconds)
      nextStepStartTimeSeconds += currentStepDurationSeconds
      advanceToNextStep()
    }
  }

  function startMusicLoopIfStopped(): void {
    if (musicSchedulerTimerId !== null) return
    currentTrackIndex = 0
    currentBarIndex = 0
    currentStepIndex = 0
    currentTrackLoopsPlayed = 0
    currentStepDurationSeconds = loopStepDurationSeconds(TECHNO_TRACKS[0].beatsPerMinute)
    nextStepStartTimeSeconds = audioContext.currentTime + 0.06
    musicSchedulerTimerId = setInterval(scheduleDueLoopSteps, SCHEDULER_TICK_MILLISECONDS)
  }

  // ===== public state + SFX =====

  let muted = false

  return {
    resumeAfterFirstUserGesture(): void {
      if (audioContext.state === 'suspended') void audioContext.resume()
      startMusicLoopIfStopped()
    },
    toggleMuted(): boolean {
      muted = !muted
      masterGainNode.gain.value = muted ? 0 : MASTER_OUTPUT_GAIN
      return muted
    },
    isMuted(): boolean {
      return muted
    },
    playLaserZapSound(): void {
      const now = audioContext.currentTime
      playOscillatorTone(soundEffectsBusGainNode, 'square', 1400, 300, now, 0.12, 0.4)
    },
    playMissileLaunchSound(): void {
      const now = audioContext.currentTime
      playOscillatorTone(soundEffectsBusGainNode, 'sawtooth', 520, 120, now, 0.35, 0.35)
      playNoiseBurst(soundEffectsBusGainNode, now, 0.35, 0.25, 'lowpass', 1200)
    },
    playEnemyHitSound(): void {
      const now = audioContext.currentTime
      playOscillatorTone(soundEffectsBusGainNode, 'square', 900, 600, now, 0.07, 0.3)
    },
    playExplosionSound(): void {
      const now = audioContext.currentTime
      playNoiseBurst(soundEffectsBusGainNode, now, 0.5, 0.7, 'lowpass', 900)
      playOscillatorTone(soundEffectsBusGainNode, 'square', 120, 40, now, 0.5, 0.45)
    },
    playPlayerHitSound(): void {
      const now = audioContext.currentTime
      playOscillatorTone(soundEffectsBusGainNode, 'sawtooth', 220, 90, now, 0.22, 0.45)
    },
    playWaveStartSound(): void {
      const now = audioContext.currentTime
      // rising 8-bit arpeggio A4 -> C5 -> E5
      ;[0, 3, 7].forEach((semitone, noteIndex) => {
        const frequency = semitoneOffsetFromA4ToFrequencyHz(semitone)
        playOscillatorTone(soundEffectsBusGainNode, 'square', frequency, frequency, now + noteIndex * 0.09, 0.1, 0.35)
      })
    },
    playWaveClearedSound(): void {
      const now = audioContext.currentTime
      // triumphant triad arpeggio one octave up
      ;[12, 16, 19, 24].forEach((semitone, noteIndex) => {
        const frequency = semitoneOffsetFromA4ToFrequencyHz(semitone)
        playOscillatorTone(soundEffectsBusGainNode, 'square', frequency, frequency, now + noteIndex * 0.1, 0.14, 0.35)
      })
    },
    playPlayerDestroyedSound(): void {
      const now = audioContext.currentTime
      playOscillatorTone(soundEffectsBusGainNode, 'sawtooth', 400, 40, now, 0.8, 0.5)
      playNoiseBurst(soundEffectsBusGainNode, now, 0.8, 0.5, 'lowpass', 700)
    },
  }
}
