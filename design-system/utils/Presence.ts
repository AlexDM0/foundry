/**
 * A part that animates out before it goes: shown while open, and through its leaving animation after `isOpen` turns false, which the part
 * draws while `isLeaving` is true. The leaving time is read from the element's animation, so with no motion the part goes at once.
 */
import { useEffect, useState, type RefObject } from 'react';

const MILLISECONDS_PER_SECOND = 1000;

export interface Presence {
  readonly isShown:   boolean;
  readonly isLeaving: boolean;
}

function leavingMillisecondsOf(element: Element): number {
  const style = getComputedStyle(element);
  if (style.animationName === '' || style.animationName === 'none') return 0;
  const seconds = (Number.parseFloat(style.animationDuration) || 0) + (Number.parseFloat(style.animationDelay) || 0);
  return seconds * MILLISECONDS_PER_SECOND;
}

export function usePresence(isOpen: boolean, element: RefObject<Element | null>): Presence {
  const [presence, setPresence] = useState<Presence>({ isShown: isOpen, isLeaving: false });
  if (isOpen && (!presence.isShown || presence.isLeaving)) setPresence({ isShown: true, isLeaving: false });
  if (!isOpen && presence.isShown && !presence.isLeaving) setPresence({ isShown: true, isLeaving: true });
  useEffect(() => {
    if (!presence.isLeaving) return undefined;
    const finish = (): void => setPresence({ isShown: false, isLeaving: false });
    const duration = element.current === null ? 0 : leavingMillisecondsOf(element.current);
    if (duration === 0) {
      finish();
      return undefined;
    }
    const timer = window.setTimeout(finish, duration);
    return () => window.clearTimeout(timer);
  }, [presence.isLeaving, element]);
  return presence;
}
