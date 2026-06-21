import './gameSettingsMenu.css'
import type { GameAudioSystem } from '../audio/proceduralGameAudio'

// D90: the SETTINGS menu. The old "SOUND: ON/OFF" toggle is replaced by a hamburger button that opens
// a panel covering the ship view and PAUSES gameplay (the caller freezes the sim while it's open). The
// panel holds independent MUSIC and SOUND-EFFECTS volume sliders (0 = off — there is no separate
// on/off). Volume changes apply live to the audio engine; the menu is dismissed with RESUME.

export type GameSettingsMenu = {
  isOpen(): boolean
  close(): void
}

function addVolumeSliderRow(
  parent: HTMLElement,
  labelText: string,
  readVolumeFraction: () => number,
  writeVolumeFraction: (volumeFraction: number) => void,
): void {
  const row = document.createElement('label')
  row.className = 'settingsMenuRow'
  const labelLine = document.createElement('div')
  labelLine.className = 'settingsMenuRowLabelLine'
  const labelSpan = document.createElement('span')
  labelSpan.textContent = labelText
  const valueSpan = document.createElement('span')
  valueSpan.className = 'settingsMenuRowValue'

  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = '0'
  slider.max = '100'
  slider.step = '1'
  const refreshValueLabel = (): void => {
    const percent = Math.round(readVolumeFraction() * 100)
    valueSpan.textContent = percent === 0 ? 'off' : `${percent}%`
  }
  slider.value = String(Math.round(readVolumeFraction() * 100))
  refreshValueLabel()
  slider.addEventListener('input', () => {
    writeVolumeFraction(Number(slider.value) / 100)
    refreshValueLabel()
  })

  labelLine.appendChild(labelSpan)
  labelLine.appendChild(valueSpan)
  row.appendChild(labelLine)
  row.appendChild(slider)
  parent.appendChild(row)
}

export function createGameSettingsMenu(
  parentElement: HTMLElement,
  audioSystem: GameAudioSystem,
  onPauseStateChange: (isMenuOpen: boolean) => void,
): GameSettingsMenu {
  const hamburgerButton = document.createElement('button')
  hamburgerButton.className = 'settingsHamburgerButton'
  hamburgerButton.textContent = '☰'
  hamburgerButton.setAttribute('aria-label', 'Settings')
  parentElement.appendChild(hamburgerButton)

  const overlay = document.createElement('div')
  overlay.className = 'settingsMenuOverlay'

  const panel = document.createElement('div')
  panel.className = 'settingsMenuPanel'
  const title = document.createElement('div')
  title.className = 'settingsMenuTitle'
  title.textContent = 'SETTINGS'
  panel.appendChild(title)

  addVolumeSliderRow(
    panel,
    'Music volume',
    () => audioSystem.getMusicVolumeFraction(),
    (volumeFraction) => audioSystem.setMusicVolumeFraction(volumeFraction),
  )
  addVolumeSliderRow(
    panel,
    'Sound effects volume',
    () => audioSystem.getSoundEffectsVolumeFraction(),
    (volumeFraction) => audioSystem.setSoundEffectsVolumeFraction(volumeFraction),
  )

  const resumeButton = document.createElement('button')
  resumeButton.className = 'settingsMenuResumeButton'
  resumeButton.textContent = 'RESUME'
  panel.appendChild(resumeButton)

  overlay.appendChild(panel)
  parentElement.appendChild(overlay)

  let isMenuOpen = false
  function applyOpenState(): void {
    overlay.classList.toggle('settingsMenuOverlayVisible', isMenuOpen)
    hamburgerButton.classList.toggle('settingsHamburgerButtonHidden', isMenuOpen)
    onPauseStateChange(isMenuOpen)
  }
  function openMenu(): void {
    if (isMenuOpen) return
    isMenuOpen = true
    applyOpenState()
  }
  function closeMenu(): void {
    if (!isMenuOpen) return
    isMenuOpen = false
    applyOpenState()
  }

  hamburgerButton.addEventListener('click', (clickEvent) => {
    clickEvent.stopPropagation()
    openMenu()
  })
  resumeButton.addEventListener('click', (clickEvent) => {
    clickEvent.stopPropagation()
    closeMenu()
  })
  // tapping the dim backdrop (outside the panel) also resumes
  overlay.addEventListener('pointerdown', (pointerEvent) => {
    if (pointerEvent.target === overlay) {
      pointerEvent.stopPropagation()
      closeMenu()
    }
  })

  return {
    isOpen(): boolean {
      return isMenuOpen
    },
    close(): void {
      closeMenu()
    },
  }
}
