/**
 * The board's visit target for Flint: the open screen's Flint slot, whatever User presses or focuses, since a slot keeps Flint off the content
 * around it; on a screen with no slot, the habitat User last focused or clicked in. A habitat counts as its whole workplace
 * (`data-flint-workplace`). Flint is sent to a slot at once when it shows, so it never waits at its home corner for its director's next turn.
 */
import { FLINT_OVERLAY_ATTRIBUTE, type RegisteredHabitat } from '../../lib/flint/FlintInterface.ts';
import type { FlintSlotShowing }                           from './FlintSlotShowing.ts';

export const FLINT_WORKPLACE_ATTRIBUTE = 'data-flint-workplace';

/** The part of Flint's handle the tracker uses. */
export interface VisitingFlint {
  readonly perform: (intent: 'visit') => unknown;
}

export interface VisitTargetTracker {
  /** Follows User's focus and presses in `document`; returns the function that stops. */
  readonly follow:      (document: Document) => () => void;
  readonly slotShown:   FlintSlotShowing;
  /** Called with Flint once it is made, and with null once it is gone. */
  readonly flintMade:   (flint: VisitingFlint | null) => void;
  /** A visit-target policy of the host's own, for `createFlint`. */
  readonly visitTarget: (habitats: readonly RegisteredHabitat[]) => RegisteredHabitat | null;
}

function innermostHabitatAround(workedIn: Element, habitats: readonly RegisteredHabitat[]): RegisteredHabitat | null {
  let innermost: { readonly registered: RegisteredHabitat; readonly workplace: Element } | null = null;
  for (const registered of habitats) {
    const { element } = registered;
    const workplace = element.closest(`[${FLINT_WORKPLACE_ATTRIBUTE}]`) ?? element;
    const isInside = workplace.contains(workedIn);
    if (isInside && (innermost === null || (innermost.workplace !== workplace && innermost.workplace.contains(workplace)))) {
      innermost = { registered, workplace };
    }
  }
  return innermost?.registered ?? null;
}

export function createVisitTargetTracker(): VisitTargetTracker {
  let lastWorkedInElement: Element | null = null;
  let workedInHabitatElement: HTMLElement | null = null;
  let flintNow: VisitingFlint | null = null;
  const shownSlots: HTMLElement[] = [];
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
    slotShown: (slotElement) => {
      shownSlots.push(slotElement);
      lastWorkedInElement = null;
      workedInHabitatElement = null;
      flintNow?.perform('visit');
      return () => {
        const shownIndex = shownSlots.lastIndexOf(slotElement);
        if (shownIndex !== -1) shownSlots.splice(shownIndex, 1);
      };
    },
    flintMade: (flint) => {
      flintNow = flint;
      if (shownSlots.length > 0) flint?.perform('visit');
    },
    visitTarget: (habitats) => {
      const openSlot = shownSlots.findLast((slotElement) => habitats.some((registered) => registered.element === slotElement));
      const openSlotHabitat = habitats.find((registered) => registered.element === openSlot);
      if (openSlotHabitat !== undefined) return openSlotHabitat;
      const workedIn = lastWorkedInElement === null ? null : innermostHabitatAround(lastWorkedInElement, habitats);
      if (workedIn !== null) workedInHabitatElement = workedIn.element;
      return habitats.find((registered) => registered.element === workedInHabitatElement) ?? null;
    },
  };
}
