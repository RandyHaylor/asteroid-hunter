import { describe, expect, it } from 'vitest'
import { shipAutopilotSettings } from './shipAutopilotSettings'

// D123: the default AI approach angle must drive the autopilot IN to attack, not skirt at max range.
// 90° (perpendicular flank) made the default AI fly too wide and never engage; 60° closes in.
describe('shipAutopilotSettings defaults', () => {
  it('defaults the approach angle to 60° so the default AI actually attacks', () => {
    expect(shipAutopilotSettings.preferredApproachAngleDegrees).toBe(60)
  })

  it('keeps the approach angle within the slider range (0–90°)', () => {
    expect(shipAutopilotSettings.preferredApproachAngleDegrees).toBeGreaterThanOrEqual(0)
    expect(shipAutopilotSettings.preferredApproachAngleDegrees).toBeLessThanOrEqual(90)
  })

})
