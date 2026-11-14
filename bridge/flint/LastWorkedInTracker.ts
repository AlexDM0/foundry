/**
 * The Bridge's visit target for Flint: the habitat User last focused or clicked, where a habitat counts as its whole workplace, the
 * nearest element around it marked `data-flint-workplace`, such as the chat card that holds the thread and its composer. Typing in the
 * composer thus makes the thread the place Flint visits. A press on Flint itself changes nothing.
 */
import { FLINT_OVERLAY_ATTRIBUTE, type RegisteredHabitat } from '../../flint/SpriteHabitat.ts';

export const FLINT_WORKPLACE_ATTRIBUTE = 'data-flint-workplace';

export interface LastWorkedInTracker {
  /** Follows User's focus and presses in `document`; returns the function that stops. */
  readonly follow:      (document: Document) => () => void;
  /** A visit-target policy of the host's own, for `createFlint`. */
  readonly visitTarget: (habitats: readonly RegisteredHabitat[]) => RegisteredHabitat | null;
}

function workplaceOf(element: HTMLElement): Element {
  return element.closest(`[${FLINT_WORKPLACE_ATTRIBUTE}]`) ?? element;
}

export function createLastWorkedInTracker(): LastWorkedInTracker {
  let lastWorkedInElement: Element | null = null;
  const remember = (event: Event): void => {
    if (event.target instanceof Element && event.target.closest(`[${FLINT_OVERLAY_ATTRIBUTE}]`) === null) lastWorkedInElement = event.target;
  };
  return {
    follow: (document) => {
      document.addEventListener('focusin', remember, true);
      document.addEventListener('pointerdown', remember, true);
      return () => {
        document.removeEventListener('focusin', remember, true);
        document.removeEventListener('pointerdown', remember, true);
      };
    },
    visitTarget: (habitats) => {
      const workedIn = lastWorkedInElement;
      if (workedIn === null) return null;
      return habitats.find((registered) => workplaceOf(registered.element).contains(workedIn)) ?? null;
    },
  };
}
