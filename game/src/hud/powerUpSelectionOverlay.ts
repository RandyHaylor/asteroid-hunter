import './powerUpSelectionOverlay.css'
import type { PowerUpDefinition } from '../upgrades/powerUpDefinitions'

// D33: the between-wave upgrade picker. Shows two power-up cards; tapping one fires the onChosen
// callback (which applies the stat and advances the wave) and hides the overlay. Pure presentation.

export type PowerUpSelectionOverlay = {
  showPowerUpChoices(
    offeredPowerUps: readonly PowerUpDefinition[],
    onPowerUpChosen: (chosenPowerUp: PowerUpDefinition) => void,
  ): void
  hide(): void
}

export function createPowerUpSelectionOverlay(hudOverlayRoot: HTMLElement): PowerUpSelectionOverlay {
  const overlayBackdrop = document.createElement('div')
  overlayBackdrop.className = 'powerUpSelectionBackdrop'

  const overlayTitle = document.createElement('div')
  overlayTitle.className = 'powerUpSelectionTitle'
  overlayTitle.textContent = 'CHOOSE AN UPGRADE'
  overlayBackdrop.appendChild(overlayTitle)

  const cardRow = document.createElement('div')
  cardRow.className = 'powerUpSelectionCardRow'
  overlayBackdrop.appendChild(cardRow)

  hudOverlayRoot.appendChild(overlayBackdrop)

  function hide(): void {
    overlayBackdrop.classList.remove('powerUpSelectionBackdropVisible')
    cardRow.replaceChildren()
  }

  return {
    showPowerUpChoices(offeredPowerUps, onPowerUpChosen): void {
      cardRow.replaceChildren()
      for (const powerUp of offeredPowerUps) {
        const card = document.createElement('button')
        card.className = 'powerUpSelectionCard'

        const cardIcon = document.createElement('div')
        cardIcon.className = 'powerUpSelectionCardIcon'
        cardIcon.innerHTML = powerUp.iconSvgMarkup

        const cardName = document.createElement('div')
        cardName.className = 'powerUpSelectionCardName'
        cardName.textContent = powerUp.displayName

        const cardDescription = document.createElement('div')
        cardDescription.className = 'powerUpSelectionCardDescription'
        cardDescription.textContent = powerUp.description

        card.appendChild(cardIcon)
        card.appendChild(cardName)
        card.appendChild(cardDescription)
        card.addEventListener('click', () => {
          onPowerUpChosen(powerUp)
        })
        cardRow.appendChild(card)
      }
      overlayBackdrop.classList.add('powerUpSelectionBackdropVisible')
    },
    hide,
  }
}
