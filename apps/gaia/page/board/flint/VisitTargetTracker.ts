/**
 * The board's visit target for Flint: the Flint slot of the open screen, the newest slot that shows among the habitats Flint can live in,
 * unless User focused or clicked in another habitat since it showed; then that habitat, until User works in another one or a slot shows
 * again, as on a change of screen. A habitat counts as its whole workplace, the nearest element around it marked `data-flint-workplace`
 * (the chat card holds the thread and its composer), and a slot as its own box; of the habitats around the element User worked in, the
 * innermost wins. A focus or a press outside every habitat, or on Flint itself, changes nothing. With no slot shown and no habitat worked
 * in, Flint visits none. The tracker sends Flint to a slot at once when the slot shows, or when Flint is made while it shows, so Flint
 * never waits at its home corner for its director's next turn.
 */
import { FLINT_OVERLAY_ATTRIBUTE, type RegisteredHabitat } from 'flint/SpriteHabitat';
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

function innermostHabitatAround(
  workedIn: Element,
  habitats: readonly RegisteredHabitat[],
  slotElements: readonly HTMLElement[],
): RegisteredHabitat | null {
  let innermost: { readonly registered: RegisteredHabitat; readonly workplace: Element } | null = null;
  for (const registered of habitats) {
    const { element } = registered;
    const workplace = slotElements.includes(element) ? element : element.closest(`[${FLINT_WORKPLACE_ATTRIBUTE}]`) ?? element;
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
  let isTakingOverFocus = false;
  let flintNow: VisitingFlint | null = null;
  const shownSlots: HTMLElement[] = [];
  const remember = (event: Event): void => {
    if (event.type === 'focusin' && isTakingOverFocus) return;
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
      // The screen that shows the slot may move the focus as it opens, in the same turn: that is no work of User's.
      isTakingOverFocus = true;
      queueMicrotask(() => {
        isTakingOverFocus = false;
      });
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
      const workedIn = lastWorkedInElement === null ? null : innermostHabitatAround(lastWorkedInElement, habitats, shownSlots);
      if (workedIn !== null) workedInHabitatElement = workedIn.element;
      const workedInHabitat = habitats.find((registered) => registered.element === workedInHabitatElement);
      if (workedInHabitat !== undefined) return workedInHabitat;
      const openSlot = shownSlots.findLast((slotElement) => habitats.some((registered) => registered.element === slotElement));
      return habitats.find((registered) => registered.element === openSlot) ?? null;
    },
  };
}
