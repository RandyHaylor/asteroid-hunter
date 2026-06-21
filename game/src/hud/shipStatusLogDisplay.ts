import './shipStatusLogDisplay.css'
import type { ShipStatusEventLog, ShipStatusLogEntry } from './shipStatusEventLog'

// D99: on-screen view of the ship status log (new-changes line 29).
//  - MANUAL mode: only the LATEST message shows, then fades after a few seconds (bottom-center, in the
//    same spot as the "AI PILOT ACTIVE" hint).
//  - AI mode: a small running 2-line log sits at the bottom; tapping it opens the full, scrollable wave
//    log (all entries this run). The log itself always records in both modes — only visibility differs.

const MANUAL_LATEST_MESSAGE_VISIBLE_SECONDS = 4
const AI_RUNNING_LOG_LINE_COUNT = 2

export type ShipStatusLogDisplay = {
  /** call every frame with the current mode + clock; refreshes the mini log / latest-message fade */
  updateShipStatusLogDisplay(isAiModeActive: boolean, nowSeconds: number): void
}

export function createShipStatusLogDisplay(
  viewHudOverlay: HTMLElement,
  statusEventLog: ShipStatusEventLog,
): ShipStatusLogDisplay {
  // the bottom-center mini log (AI: 2 running lines; manual: latest line, fading)
  const miniLog = document.createElement('div')
  miniLog.className = 'shipStatusMiniLog'
  viewHudOverlay.appendChild(miniLog)

  // the full scrollable wave log overlay (opened by tapping the mini log in AI mode)
  const fullLogOverlay = document.createElement('div')
  fullLogOverlay.className = 'shipStatusFullLogOverlay'
  const fullLogPanel = document.createElement('div')
  fullLogPanel.className = 'shipStatusFullLogPanel'
  const fullLogTitle = document.createElement('div')
  fullLogTitle.className = 'shipStatusFullLogTitle'
  fullLogTitle.textContent = 'WAVE LOG'
  const fullLogList = document.createElement('div')
  fullLogList.className = 'shipStatusFullLogList'
  const fullLogCloseButton = document.createElement('button')
  fullLogCloseButton.className = 'shipStatusFullLogClose'
  fullLogCloseButton.textContent = 'CLOSE'
  fullLogPanel.appendChild(fullLogTitle)
  fullLogPanel.appendChild(fullLogList)
  fullLogPanel.appendChild(fullLogCloseButton)
  fullLogOverlay.appendChild(fullLogPanel)
  viewHudOverlay.appendChild(fullLogOverlay)

  function renderLineElements(container: HTMLElement, logEntries: readonly ShipStatusLogEntry[]): void {
    container.replaceChildren()
    for (const entry of logEntries) {
      const line = document.createElement('div')
      line.className = 'shipStatusLogLine'
      line.textContent = entry.message
      container.appendChild(line)
    }
  }

  function openFullLog(): void {
    renderLineElements(fullLogList, statusEventLog.getAllEntries())
    fullLogOverlay.classList.add('shipStatusFullLogOverlayVisible')
    fullLogList.scrollTop = fullLogList.scrollHeight // newest at the bottom, scrolled into view
  }
  function closeFullLog(): void {
    fullLogOverlay.classList.remove('shipStatusFullLogOverlayVisible')
  }
  miniLog.addEventListener('click', () => {
    if (miniLog.classList.contains('shipStatusMiniLogTappable')) openFullLog()
  })
  fullLogCloseButton.addEventListener('click', (clickEvent) => {
    clickEvent.stopPropagation()
    closeFullLog()
  })
  fullLogOverlay.addEventListener('pointerdown', (pointerEvent) => {
    if (pointerEvent.target === fullLogOverlay) closeFullLog()
  })

  return {
    updateShipStatusLogDisplay(isAiModeActive, nowSeconds): void {
      if (isAiModeActive) {
        // AI: running 2-line log, always visible + tappable to expand
        renderLineElements(miniLog, statusEventLog.getRecentEntries(AI_RUNNING_LOG_LINE_COUNT))
        miniLog.style.opacity = '1'
        miniLog.classList.add('shipStatusMiniLogTappable')
      } else {
        // manual: only the latest message, fading out after MANUAL_LATEST_MESSAGE_VISIBLE_SECONDS
        closeFullLog() // the expandable log is an AI-mode affordance
        miniLog.classList.remove('shipStatusMiniLogTappable')
        const allEntries = statusEventLog.getAllEntries()
        const latestEntry = allEntries.length > 0 ? allEntries[allEntries.length - 1] : null
        if (latestEntry === null) {
          miniLog.style.opacity = '0'
          return
        }
        const ageSeconds = nowSeconds - latestEntry.timestampSeconds
        if (ageSeconds >= MANUAL_LATEST_MESSAGE_VISIBLE_SECONDS) {
          miniLog.style.opacity = '0'
          return
        }
        renderLineElements(miniLog, [latestEntry])
        // hold full opacity for the first ~70% of the window, then fade out over the remainder
        const fadeStartSeconds = MANUAL_LATEST_MESSAGE_VISIBLE_SECONDS * 0.7
        miniLog.style.opacity =
          ageSeconds <= fadeStartSeconds
            ? '1'
            : `${Math.max(0, 1 - (ageSeconds - fadeStartSeconds) / (MANUAL_LATEST_MESSAGE_VISIBLE_SECONDS - fadeStartSeconds))}`
      }
    },
  }
}
