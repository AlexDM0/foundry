/**
 * A card that hangs under its anchor, the trigger's wrapper, which the host positions: nothing while closed; open, dismissed by Esc or by
 * a pointer down or focus outside it and its anchor, with the reason. Its Esc is caught before any panel's, as a popover lies over them.
 * The trigger hands the focus back itself, as only it knows where the focus belongs. It drops in on open, and on close lifts away inert.
 */
import { useRef, type ReactNode, type RefObject } from 'react';

import { useDismissal, type DismissalReason } from '../utils/Dismissal.ts';
import { usePresence }                        from '../utils/Presence.ts';

export type PopoverPlacement = 'below-end' | 'below-start';

/** `standard` a padded card, `menu` an unpadded one of sections, `inbox` the wider unpadded list. */
export type PopoverWidth = 'standard' | 'menu' | 'inbox';

export interface PopoverProps {
  readonly label:     string;
  readonly role:      'dialog' | 'menu';
  readonly isOpen:    boolean;
  readonly onDismiss: (reason: DismissalReason) => void;
  /** The trigger's wrapper, which holds the popover and counts as inside. */
  readonly anchorRef: RefObject<HTMLElement | null>;
  readonly placement: PopoverPlacement;
  readonly width:     PopoverWidth;
  readonly children:  ReactNode;
}

export function Popover({
  label, role, isOpen, onDismiss, anchorRef, placement, width, children
}: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  useDismissal({
    isOpen, insideRefs: [popoverRef, anchorRef], onDismiss, escapePhase: 'capture',
  });
  const { isShown, isLeaving } = usePresence(isOpen, popoverRef);
  if (!isShown) return null;
  return (
    <div
      ref={popoverRef}
      className="design-system-popover"
      role={role}
      aria-label={label}
      data-placement={placement}
      data-width={width}
      data-motion={isLeaving ? 'out' : undefined}
      inert={isLeaving}
    >
      {children}
    </div>
  );
}
