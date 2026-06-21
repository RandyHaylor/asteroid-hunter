import './powerUpSelectionOverlay.css'
import type { PowerUpDefinition } from '../upgrades/powerUpDefinitions'

// D33: the between-wave upgrade picker. Shows two power-up cards; tapping one fires the onChosen
// callback (which applies the stat and advances the wave) and hides the overlay. Pure presentation.

export type PowerUpSelectionOverlay = {
  showPowerUpChoices(
    offeredPowerUps: readonly PowerUpDefinition[],
    onPowerUpChosen: (chosenPowerUp: PowerUpDefinition) => void,
  ): void
  /** D92: visually flash/highlight the card the AI auto-picked (before it auto-commits) */
  flashAutoChosenPowerUp(chosenPowerUp: PowerUpDefinition): void
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

  // D92: track each offered card by its power-up so the AI auto-pick can flash the right one
  const cardElementByPowerUp = new Map<PowerUpDefinition, HTMLElement>()

  function hide(): void {
    overlayBackdrop.classList.remove('powerUpSelectionBackdropVisible')
    cardRow.replaceChildren()
    cardElementByPowerUp.clear()
  }

  return {
    showPowerUpChoices(offeredPowerUps, onPowerUpChosen): void {
      cardRow.replaceChildren()
      cardElementByPowerUp.clear()
      for (const powerUp of offeredPowerUps) {
        const card = document.createElement('button')
        card.className = 'powerUpSelectionCard'
        cardElementByPowerUp.set(powerUp, card)

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
    flashAutoChosenPowerUp(chosenPowerUp): void {
      const chosenCard = cardElementByPowerUp.get(chosenPowerUp)
      if (chosenCard) chosenCard.classList.add('powerUpSelectionCardAutoChosen')
    },
    hide,
  }
}
