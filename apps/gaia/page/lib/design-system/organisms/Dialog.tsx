/**
 * A modal over the whole page: a native `<dialog>` shown with `showModal()`, so the page behind is inert. Esc, × and a backdrop click ask the
 * caller to dismiss it with a reason; the caller closes it through `isOpen`. Opening focuses the named element, else the first field or ×, and
 * Tab cycles inside; closing slides it out and returns the focus to the opener.
 */
import {
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent
} from 'react';

import { IconButton }  from '../atoms/IconButton.tsx';
import { usePresence } from '../utils/Presence.ts';

const FIELD_SELECTOR = 'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [contenteditable="true"]';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not([type="hidden"]):not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

export type DialogDismissalReason = 'escape' | 'close' | 'backdrop';

/** 460, 560, 600 and 640 pixels wide, and `page` 1208, a page's content row. */
export type DialogWidth = 'narrow' | 'standard' | 'wide' | 'widest' | 'page';

export interface DialogProps {
  readonly title:         string;
  /** The small-capitals line over the title. */
  readonly kicker?:       string;
  /** What sits after the title on its line, such as a meter. */
  readonly headEnd?:      ReactNode;
  readonly description?:  string;
  readonly isOpen:        boolean;
  readonly onDismiss:     (reason: DialogDismissalReason) => void;
  readonly closeLabel:    string;
  readonly width:         DialogWidth;
  readonly foot?:         ReactNode;
  /** What takes the focus on open, such as a group the form starts with; absent or empty, the first field does. */
  readonly initialFocus?: RefObject<HTMLElement | null>;
  readonly children:      ReactNode;
}

function focusableElementsIn(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((element) => element.closest('[hidden], [inert]') === null);
}

/**
 * Shows the dialog as a modal, moves the focus into it, and on close hands the focus back to its opener. The ref it returns is true
 * while the component closes the dialog itself, so a `close` event then is not the browser's.
 */
function useModalFocus(
  isShown: boolean,
  dialog: RefObject<HTMLDialogElement | null>,
  closeButton: RefObject<HTMLButtonElement | null>,
  initialFocus: RefObject<HTMLElement | null> | undefined
): RefObject<boolean> {
  const isClosingItself = useRef(false);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!isShown || element === null) return undefined;
    const opener = document.activeElement;
    isClosingItself.current = false;
    if (!element.open) element.showModal();
    const firstField = element.querySelector<HTMLElement>(FIELD_SELECTOR);
    (initialFocus?.current ?? firstField ?? closeButton.current)?.focus({ preventScroll: true });
    return () => {
      isClosingItself.current = true;
      if (element.open) element.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [isShown, dialog, closeButton, initialFocus]);
  return isClosingItself;
}

export function Dialog({
  title, kicker, headEnd, description, isOpen, onDismiss, closeLabel, width, foot, initialFocus, children
}: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const pressStartedOnBackdrop = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const { isShown, isLeaving } = usePresence(isOpen, dialog);
  const isClosingItself = useModalFocus(isShown, dialog, closeButton, initialFocus);
  if (!isShown) return null;

  const dismissOnKey = (event: KeyboardEvent<HTMLDialogElement>): void => {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') {
      // Cancelling the keydown keeps the browser from closing the dialog itself: the caller closes it.
      event.preventDefault();
      onDismiss('escape');
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = focusableElementsIn(event.currentTarget);
    const first = focusables.at(0);
    const last = focusables.at(-1);
    if (first === undefined || last === undefined) return;
    const active = document.activeElement;
    const leavesAtStart = event.shiftKey && (active === first || !event.currentTarget.contains(active));
    const leavesAtEnd = !event.shiftKey && (active === last || !event.currentTarget.contains(active));
    if (!leavesAtStart && !leavesAtEnd) return;
    event.preventDefault();
    (leavesAtStart ? last : first).focus();
  };
  // A click whose press began and ended on the dialog element itself fell on the backdrop: the panel covers the element's own box.
  const notePressStart = (event: MouseEvent<HTMLDialogElement>): void => {
    pressStartedOnBackdrop.current = event.target === event.currentTarget;
  };
  const dismissOnBackdrop = (event: MouseEvent<HTMLDialogElement>): void => {
    if (event.target === event.currentTarget && pressStartedOnBackdrop.current) onDismiss('backdrop');
    pressStartedOnBackdrop.current = false;
  };
  const dismissOnCancel = (event: SyntheticEvent<HTMLDialogElement>): void => {
    event.preventDefault();
    onDismiss('escape');
  };
  const dismissOnClosedByBrowser = (): void => {
    if (!isClosingItself.current) onDismiss('escape');
  };

  return (
    <dialog
      ref={dialog}
      className="design-system-dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description === undefined ? undefined : descriptionId}
      data-width={width}
      data-motion={isLeaving ? 'out' : 'in'}
      onKeyDown={dismissOnKey}
      onMouseDown={notePressStart}
      onClick={dismissOnBackdrop}
      onCancel={dismissOnCancel}
      onClose={dismissOnClosedByBrowser}
    >
      <div className="design-system-dialog-panel">
        <div className="design-system-dialog-head">
          <div className="design-system-dialog-heading">
            {kicker === undefined ? null : <span className="design-system-dialog-kicker">{kicker}</span>}
            <div className="design-system-dialog-title-line">
              <h2 id={titleId} className="design-system-dialog-title">{title}</h2>
              {headEnd}
            </div>
            {description === undefined ? null : <p id={descriptionId} className="design-system-dialog-description">{description}</p>}
          </div>
          <IconButton glyph="close" accessibleName={closeLabel} onPress={() => onDismiss('close')} buttonRef={closeButton} />
        </div>
        <div className="design-system-dialog-body">{children}</div>
        {foot === undefined ? null : <div className="design-system-dialog-foot">{foot}</div>}
      </div>
    </dialog>
  );
}
