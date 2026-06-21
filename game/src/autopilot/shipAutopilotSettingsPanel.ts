import './shipAutopilotSettingsPanel.css'
import { shipAutopilotSettings, type AutopilotTargetPriority } from './shipAutopilotSettings'
import { playerShipBaseFlightStats, playerShipBaseTractorBeamStats, playerEngagementRange } from '../shipStats'
import { playerBaseLaserStats, playerBaseMissileStats } from '../weapons/weaponStats'

// D75: the AI-mode settings overlay. A semi-transparent shaded panel (radar stays visible behind it)
// holding the autopilot's tunable knobs, plus a "^" caret button (top-right of the controls) that
// shows/hides it. Shown by default whenever AI mode is active; fully hidden in manual mode. The inputs
// mutate the live shipAutopilotSettings singleton the autopilot reads each frame — tuning IS gameplay.

export type ShipAutopilotSettingsPanel = {
  /** called when AI mode toggles — shows the panel (respecting the caret) in AI, hides it in manual */
  setAiModeActive(isAiModeActive: boolean): void
  /**
   * D87: enable/disable the EXIT AI PILOT button. During a forced-AI wave (wave 3) exiting is blocked,
   * so the button is greyed out and non-interactive rather than appearing as a live red action.
   */
  setExitAiPilotAvailable(isExitAvailable: boolean): void
  /** D101: refresh the live ship-stats grid values (call when they may have changed, e.g. each frame in AI) */
  refreshLiveStats(): void
}

function addSliderRow(
  parent: HTMLElement,
  labelText: string,
  minValue: number,
  maxValue: number,
  stepValue: number,
  readValue: () => number,
  writeValue: (value: number) => void,
  formatValue: (value: number) => string,
): void {
  // D92: label, slider, and value all on ONE line (label | slider | value) to save vertical space.
  const row = document.createElement('label')
  row.className = 'aiSettingRow aiSettingSliderRow'
  const labelSpan = document.createElement('span')
  labelSpan.className = 'aiSettingLabel'
  const valueSpan = document.createElement('span')
  valueSpan.className = 'aiSettingValue'
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = String(minValue)
  slider.max = String(maxValue)
  slider.step = String(stepValue)
  slider.value = String(readValue())
  const refreshLabel = (): void => {
    labelSpan.textContent = labelText
    valueSpan.textContent = formatValue(readValue())
  }
  slider.addEventListener('input', () => {
    writeValue(Number(slider.value))
    refreshLabel()
  })
  refreshLabel()
  row.appendChild(labelSpan)
  row.appendChild(slider)
  row.appendChild(valueSpan)
  parent.appendChild(row)
}

export function createShipAutopilotSettingsPanel(
  parentElement: HTMLElement,
  onExitAiPilot: () => void,
): ShipAutopilotSettingsPanel {
  // EXIT AI PILOT button (top, by the caret) — leaves AI mode back to manual flight (D77)
  const exitAiPilotButton = document.createElement('button')
  exitAiPilotButton.className = 'aiExitPilotButton'
  exitAiPilotButton.textContent = 'EXIT AI PILOT'
  exitAiPilotButton.addEventListener('click', () => {
    if (exitAiPilotButton.disabled) return // D87: blocked during a forced-AI wave
    onExitAiPilot()
  })
  parentElement.appendChild(exitAiPilotButton)

  // caret toggle (top-right of the controls) — show/hide the panel while in AI mode
  const caretToggleButton = document.createElement('button')
  caretToggleButton.className = 'aiSettingsCaretToggle'
  caretToggleButton.textContent = '⌄' // points down when panel is shown (tap to collapse)
  parentElement.appendChild(caretToggleButton)

  const panel = document.createElement('div')
  panel.className = 'aiSettingsPanel'
  parentElement.appendChild(panel)

  const title = document.createElement('div')
  title.className = 'aiSettingsTitle'
  title.textContent = 'AI PILOT SETTINGS'
  panel.appendChild(title)

  // D92: 90° is the max meaningful approach angle (perpendicular flank) — you aren't "approaching" past it
  addSliderRow(panel, 'Approach angle', 0, 90, 5,
    () => shipAutopilotSettings.preferredApproachAngleDegrees,
    (v) => (shipAutopilotSettings.preferredApproachAngleDegrees = v),
    (v) => `${Math.round(v)}°`)
  addSliderRow(panel, 'Engage range', 100, 1000, 20,
    () => shipAutopilotSettings.preferredEngagementRangeMeters,
    (v) => (shipAutopilotSettings.preferredEngagementRangeMeters = v),
    (v) => `${Math.round(v)} m`)
  addSliderRow(panel, 'Isolation (single-out)', 0, 1, 0.05,
    () => shipAutopilotSettings.isolationWeight,
    (v) => (shipAutopilotSettings.isolationWeight = v),
    (v) => v.toFixed(2))
  addSliderRow(panel, 'Flee if > N in range', 0, 8, 1,
    () => shipAutopilotSettings.maxEnemiesInRangeBeforeFlee,
    (v) => (shipAutopilotSettings.maxEnemiesInRangeBeforeFlee = v),
    (v) => `${Math.round(v)}`)
  addSliderRow(panel, 'Evade below shield', 0, 1, 0.05,
    () => shipAutopilotSettings.shieldFractionBeforeEvasion,
    (v) => (shipAutopilotSettings.shieldFractionBeforeEvasion = v),
    (v) => `${Math.round(v * 100)}%`)
  addSliderRow(panel, 'Re-engage at shield', 0, 1, 0.05,
    () => shipAutopilotSettings.reEngageShieldFraction,
    (v) => (shipAutopilotSettings.reEngageShieldFraction = v),
    (v) => `${Math.round(v * 100)}%`)

  // target-priority select — D92: label + dropdown on ONE line (was stacked)
  const priorityRow = document.createElement('label')
  priorityRow.className = 'aiSettingRow aiSettingInlineRow'
  const priorityLabel = document.createElement('span')
  priorityLabel.className = 'aiSettingLabel'
  priorityLabel.textContent = 'Target priority'
  const prioritySelect = document.createElement('select')
  prioritySelect.className = 'aiSettingSelect'
  for (const option of ['nearest', 'weakest', 'mostDangerous'] as AutopilotTargetPriority[]) {
    const optionElement = document.createElement('option')
    optionElement.value = option
    optionElement.textContent = option
    prioritySelect.appendChild(optionElement)
  }
  prioritySelect.value = shipAutopilotSettings.targetPriority
  prioritySelect.addEventListener('change', () => {
    shipAutopilotSettings.targetPriority = prioritySelect.value as AutopilotTargetPriority
  })
  priorityRow.appendChild(priorityLabel)
  priorityRow.appendChild(prioritySelect)
  panel.appendChild(priorityRow)

  // D92: flee + auto-upgrade checkboxes share ONE row, side by side, to free vertical space for the log
  const checkboxPairRow = document.createElement('div')
  checkboxPairRow.className = 'aiSettingRow aiSettingCheckboxPairRow'
  panel.appendChild(checkboxPairRow)

  // flee-after-any-damage checkbox
  const fleeRow = document.createElement('label')
  fleeRow.className = 'aiSettingCheckboxRow'
  const fleeCheckbox = document.createElement('input')
  fleeCheckbox.type = 'checkbox'
  fleeCheckbox.checked = shipAutopilotSettings.fleeAfterAnyDamage
  fleeCheckbox.addEventListener('change', () => {
    shipAutopilotSettings.fleeAfterAnyDamage = fleeCheckbox.checked
  })
  const fleeLabel = document.createElement('span')
  fleeLabel.textContent = 'Flee after any damage'
  fleeRow.appendChild(fleeCheckbox)
  fleeRow.appendChild(fleeLabel)
  checkboxPairRow.appendChild(fleeRow)

  // D92: auto-choose-upgrades checkbox (default OFF) — when on, the between-wave upgrade is auto-picked
  const autoUpgradeRow = document.createElement('label')
  autoUpgradeRow.className = 'aiSettingCheckboxRow'
  const autoUpgradeCheckbox = document.createElement('input')
  autoUpgradeCheckbox.type = 'checkbox'
  autoUpgradeCheckbox.checked = shipAutopilotSettings.autoChoosesUpgrades
  autoUpgradeCheckbox.addEventListener('change', () => {
    shipAutopilotSettings.autoChoosesUpgrades = autoUpgradeCheckbox.checked
  })
  const autoUpgradeLabel = document.createElement('span')
  autoUpgradeLabel.textContent = 'AI auto-chooses upgrades'
  autoUpgradeRow.appendChild(autoUpgradeCheckbox)
  autoUpgradeRow.appendChild(autoUpgradeLabel)
  checkboxPairRow.appendChild(autoUpgradeRow)

  // D101: live CURRENT-SHIP-STATS grid (the upgradeable stats), under the settings. 3-column in
  // landscape, 1-column in portrait (body.portraitOrientation, set by the layout) so it isn't clipped.
  const liveStatDescriptors: { label: string; readValue: () => string }[] = [
    { label: 'SPEED', readValue: () => `${Math.round(playerShipBaseFlightStats.cruiseSpeedMetersPerSecond)}` },
    { label: 'HANDLING', readValue: () => playerShipBaseFlightStats.maxTurnRateRadiansPerSecond.toFixed(2) },
    { label: 'AUTO-AIM', readValue: () => playerShipBaseFlightStats.enemyTrackTurnRateRadiansPerSecond.toFixed(2) },
    { label: 'LASER DMG', readValue: () => `${Math.round(playerBaseLaserStats.boltDamage)}` },
    { label: 'RANGE', readValue: () => `${Math.round(playerEngagementRange.combinedRadarWeaponRangeMeters)}` },
    { label: 'TRACTOR', readValue: () => `${Math.round(playerShipBaseTractorBeamStats.tractorGrabMaxRangeMeters)}` },
    { label: 'MSL DMG', readValue: () => `${Math.round(playerBaseMissileStats.explosionDamage)}` },
    { label: 'MSL SPD', readValue: () => `${Math.round(playerBaseMissileStats.missileSpeedMetersPerSecond)}` },
    { label: 'MSL RATE', readValue: () => `${playerBaseMissileStats.fireCooldownSeconds.toFixed(1)}s` },
    { label: 'MSL TRACK', readValue: () => playerBaseMissileStats.homingTurnRateRadiansPerSecond.toFixed(2) },
  ]
  const statsTitle = document.createElement('div')
  statsTitle.className = 'aiSettingsTitle'
  statsTitle.textContent = 'SHIP STATS'
  panel.appendChild(statsTitle)
  const statsGrid = document.createElement('div')
  statsGrid.className = 'aiSettingsStatsGrid'
  const statValueSpans: { valueSpan: HTMLElement; readValue: () => string }[] = []
  for (const descriptor of liveStatDescriptors) {
    const cell = document.createElement('div')
    cell.className = 'aiSettingsStatCell'
    const labelSpan = document.createElement('span')
    labelSpan.className = 'aiSettingsStatLabel'
    labelSpan.textContent = descriptor.label
    const valueSpan = document.createElement('span')
    valueSpan.className = 'aiSettingsStatValue'
    cell.appendChild(labelSpan)
    cell.appendChild(valueSpan)
    statsGrid.appendChild(cell)
    statValueSpans.push({ valueSpan, readValue: descriptor.readValue })
  }
  panel.appendChild(statsGrid)
  function refreshLiveStats(): void {
    for (const { valueSpan, readValue } of statValueSpans) valueSpan.textContent = readValue()
  }
  refreshLiveStats()

  let isAiModeActive = false
  let isPanelExpanded = true // default shown when entering AI mode

  function applyVisibility(): void {
    const showPanel = isAiModeActive && isPanelExpanded
    panel.classList.toggle('aiSettingsPanelVisible', showPanel)
    caretToggleButton.classList.toggle('aiSettingsCaretToggleVisible', isAiModeActive)
    exitAiPilotButton.classList.toggle('aiExitPilotButtonVisible', isAiModeActive)
    caretToggleButton.textContent = isPanelExpanded ? '⌄' : '⌃'
  }

  caretToggleButton.addEventListener('click', () => {
    isPanelExpanded = !isPanelExpanded
    applyVisibility()
  })
  applyVisibility()

  return {
    setAiModeActive(active: boolean): void {
      isAiModeActive = active
      if (active) isPanelExpanded = true // default shown each time AI mode is entered
      applyVisibility()
    },
    setExitAiPilotAvailable(isExitAvailable: boolean): void {
      exitAiPilotButton.disabled = !isExitAvailable
      exitAiPilotButton.classList.toggle('aiExitPilotButtonDisabled', !isExitAvailable)
    },
    refreshLiveStats,
  }
}
