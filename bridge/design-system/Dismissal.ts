/**
 * How an open popover or menu is dismissed: Esc, or a pointer down or focus on a node none of its inside elements holds. Esc is marked
 * default-prevented, so the side panel's own Esc and the embedded page's Esc to its parent leave it, and one another layer marked so is left
 * alone: one Esc closes one thing.
 */
import { useEffect, useRef, type RefObject } from 'react';

export type DismissalReason = 'escape' | 'outside';

export interface DismissalOptions {
  readonly isOpen:       boolean;
  /** The popover and its trigger: a pointer down or focus inside any of them dismisses nothing. */
  readonly insideRefs:   readonly RefObject<Element | null>[];
  readonly onDismiss:    (reason: DismissalReason) => void;
  /** `capture` catches Esc before the side panel's own handler, which listens as it bubbles. */
  readonly escapePhase?: 'capture' | 'bubble';
}

export function useDismissal({
  isOpen, insideRefs, onDismiss, escapePhase = 'bubble'
}: DismissalOptions): void {
  const latest = useRef({ insideRefs, onDismiss });
  useEffect(() => {
    latest.current = { insideRefs, onDismiss };
  });

  useEffect(() => {
    if (!isOpen) return undefined;
    const liesOutside = (target: EventTarget | null): boolean => target instanceof Node
      && latest.current.insideRefs.every((insideRef) => insideRef.current?.contains(target) !== true);
    const dismissOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      latest.current.onDismiss('escape');
    };
    const dismissOnLeaving = (event: Event): void => {
      if (liesOutside(event.target)) latest.current.onDismiss('outside');
    };
    const listensInCapture = escapePhase === 'capture';
    document.addEventListener('keydown', dismissOnEscape, listensInCapture);
    document.addEventListener('pointerdown', dismissOnLeaving);
    document.addEventListener('focusin', dismissOnLeaving);
    return () => {
      document.removeEventListener('keydown', dismissOnEscape, listensInCapture);
      document.removeEventListener('pointerdown', dismissOnLeaving);
      document.removeEventListener('focusin', dismissOnLeaving);
    };
  }, [isOpen, escapePhase]);
}
