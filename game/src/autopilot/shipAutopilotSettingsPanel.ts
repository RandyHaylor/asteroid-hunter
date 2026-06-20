import './shipAutopilotSettingsPanel.css'
import { shipAutopilotSettings, type AutopilotTargetPriority } from './shipAutopilotSettings'

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
  const row = document.createElement('label')
  row.className = 'aiSettingRow'
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
  const labelLine = document.createElement('div')
  labelLine.className = 'aiSettingLabelLine'
  labelLine.appendChild(labelSpan)
  labelLine.appendChild(valueSpan)
  row.appendChild(labelLine)
  row.appendChild(slider)
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

  addSliderRow(panel, 'Approach angle', 0, 180, 5,
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

  // target-priority select
  const priorityRow = document.createElement('label')
  priorityRow.className = 'aiSettingRow'
  const priorityLabel = document.createElement('div')
  priorityLabel.className = 'aiSettingLabelLine'
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

  // flee-after-any-damage checkbox
  const fleeRow = document.createElement('label')
  fleeRow.className = 'aiSettingRow aiSettingCheckboxRow'
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
  panel.appendChild(fleeRow)

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
  }
}
