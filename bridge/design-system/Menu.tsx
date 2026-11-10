/**
 * A menu: a trigger button that opens a small popover of items under itself, closed by Esc, which hands the focus back to the trigger, by a
 * choice, or by a pointer down or focus outside. An item closes it by its `closing`: `return-focus` hands the focus back to the trigger,
 * `keep-focus` leaves it to whatever the item opened, and `stays-open`, a toggle, leaves the menu open.
 */
import {
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject
} from 'react';

import { useDismissal } from './Dismissal.ts';

/** `outlined` a bordered trigger holding its summary, `icon` a quiet square glyph trigger, `button` a trigger in the button's look. */
export type MenuTrigger = 'outlined' | 'icon' | 'button';

export type MenuItemClosing = 'return-focus' | 'keep-focus' | 'stays-open';

export interface MenuProps {
  /** The menu's accessible name. */
  readonly label:          string;
  readonly trigger:        MenuTrigger;
  readonly triggerContent: ReactNode;
  /** Which edge of the trigger the popover lines up with. */
  readonly align:          'start' | 'end';
  /** A dot on the trigger, such as the one saying the rows changed under a held range. */
  readonly marked?:        boolean;
  /** The trigger's accessible name when its content is a glyph rather than words. */
  readonly triggerName?:   string;
  readonly triggerTitle?:  string;
  /** Lets the caller hand the focus back to the trigger after a popover the menu opened. */
  readonly triggerRef?:    RefObject<HTMLButtonElement | null>;
  readonly children:       ReactNode;
}

const CLOSES_MENU_ATTRIBUTE = 'data-closes-menu';

export function Menu({
  label, trigger, triggerContent, align, marked = false, triggerName, triggerTitle, triggerRef, children
}: MenuProps) {
  const [menuIsOpen, setMenuIsOpen] = useState(false);
  const ownTriggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const popoverElementId = useId();
  const triggerElement = (): HTMLButtonElement | null => triggerRef?.current ?? ownTriggerRef.current;

  useDismissal({
    isOpen:     menuIsOpen,
    insideRefs: [popoverRef, ownTriggerRef],
    onDismiss:  (reason) => {
      setMenuIsOpen(false);
      if (reason === 'escape') triggerElement()?.focus();
    },
  });

  const closeOnChoice = (event: MouseEvent<HTMLDivElement>): void => {
    const item = event.target instanceof Element ? event.target.closest(`[${CLOSES_MENU_ATTRIBUTE}]`) : null;
    if (item === null) return;
    setMenuIsOpen(false);
    if (item.getAttribute(CLOSES_MENU_ATTRIBUTE) === 'return-focus') triggerElement()?.focus();
  };

  return (
    <div className="bridge-menu" data-trigger={trigger}>
      <button
        ref={(element) => {
          ownTriggerRef.current = element;
          if (triggerRef !== undefined) triggerRef.current = element;
        }}
        type="button"
        className={trigger === 'button' ? 'bridge-menu-button bridge-button' : 'bridge-menu-button'}
        data-trigger={trigger}
        data-marked={marked ? '' : undefined}
        aria-label={triggerName}
        aria-haspopup="dialog"
        aria-expanded={menuIsOpen}
        aria-controls={popoverElementId}
        title={triggerTitle}
        onClick={() => setMenuIsOpen((wasOpen) => !wasOpen)}
      >
        {triggerContent}
      </button>
      {/* The items are buttons; their click is read as it bubbles, to close the menu after the item acted. */}
      <div
        ref={popoverRef}
        id={popoverElementId}
        className="bridge-menu-popover"
        data-trigger={trigger}
        data-align={align}
        role="dialog"
        aria-label={label}
        hidden={!menuIsOpen}
        onClick={closeOnChoice}
      >
        {menuIsOpen ? children : null}
      </div>
    </div>
  );
}

export interface MenuItemProps {
  readonly label:         string;
  /** A muted word after the label. */
  readonly hint?:         string;
  readonly title?:        string;
  /** The chosen one of several: sets `aria-pressed`. */
  readonly pressed?:      boolean;
  /** A toggle: sets `aria-pressed` and shows the check while on. */
  readonly checked?:      boolean;
  /** A dot on the item, as on the menu's trigger. */
  readonly marked?:       boolean;
  /** An item that opens a dialog: says so, and whether it is open. */
  readonly dialogIsOpen?: boolean;
  readonly closing:       MenuItemClosing;
  readonly onChoose:      () => void;
}

export function MenuItem({
  label, hint, title, pressed, checked, marked = false, dialogIsOpen, closing, onChoose
}: MenuItemProps) {
  return (
    <button
      type="button"
      className="bridge-menu-item"
      aria-pressed={checked ?? pressed}
      aria-haspopup={dialogIsOpen === undefined ? undefined : 'dialog'}
      aria-expanded={dialogIsOpen}
      data-marked={marked ? '' : undefined}
      title={title}
      data-closes-menu={closing === 'stays-open' ? undefined : closing}
      onClick={onChoose}
    >
      <span>{label}</span>
      {hint === undefined ? null : <span className="bridge-menu-hint">{hint}</span>}
      {checked === undefined ? null : <span className="bridge-menu-check" aria-hidden="true">✓</span>}
    </button>
  );
}
