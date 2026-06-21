import { describe, expect, it } from 'vitest'
import { createPreWaveOneIntroSequence, type PreWaveOneIntroHooks } from './preWaveOneIntroSequence'

function makeRecordingHooks(): { hooks: PreWaveOneIntroHooks; events: string[] } {
  const events: string[] = []
  const hooks: PreWaveOneIntroHooks = {
    logStatusMessage: (m) => events.push(`msg:${m}`),
    setRadarIconsHidden: (h) => events.push(`icons:${h ? 'hidden' : 'shown'}`),
    beginAutoGrappleNearestAsteroid: () => events.push('grapple:begin'),
    releaseAutoGrapple: () => events.push('grapple:release'),
  }
  return { hooks, events }
}

function advance(sequence: ReturnType<typeof createPreWaveOneIntroSequence>, totalSeconds: number): void {
  const step = 1 / 60
  for (let t = 0; t < totalSeconds; t += step) sequence.update(step)
}

describe('preWaveOneIntroSequence', () => {
  it('fires the opening beats: hide icons + first two messages, then the orbit test + grapple', () => {
    const { hooks, events } = makeRecordingHooks()
    const seq = createPreWaveOneIntroSequence(hooks)
    seq.start()
    advance(seq, 5.2)
    expect(events[0]).toBe('icons:hidden')
    expect(events).toContain('msg:Grappling tractor beam online.')
    expect(events).toContain('msg:Grappling tractor auto-deployed — avoiding collision.')
    expect(events).toContain('msg:Testing asteroid orbit system...')
    expect(events).toContain('grapple:begin')
  })

  it('releases the grapple, confirms manual control, then ends with icons ON', () => {
    const { hooks, events } = makeRecordingHooks()
    const seq = createPreWaveOneIntroSequence(hooks)
    seq.start()
    advance(seq, 11)
    expect(events).toContain('grapple:release')
    expect(events).toContain('msg:System check: trajectory redirection confirmed. Manual control online.')
    expect(events[events.length - 1]).toBe('icons:shown') // settles ON
    expect(seq.isActive()).toBe(false)
  })

  it('is inactive until started and a no-op when updated before start', () => {
    const { hooks, events } = makeRecordingHooks()
    const seq = createPreWaveOneIntroSequence(hooks)
    expect(seq.isActive()).toBe(false)
    seq.update(1)
    expect(events.length).toBe(0)
  })
})
