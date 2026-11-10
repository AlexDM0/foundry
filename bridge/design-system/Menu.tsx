/**
 * A menu: a trigger button that opens a small popover of items under itself, closed by Esc, which hands the focus back to the trigger and
 * is caught before a side panel's own, as the popover lies over it, by a choice, or by a pointer down or focus outside. An item closes it
 * by its `closing`: `return-focus` hands the focus back to the trigger, `keep-focus` leaves it to whatever the item opened, and
 * `stays-open`, a toggle, leaves the menu open. An item may say what it does on a line under its label, and a separator parts groups of
 * items. A caller may hold whether the menu is open, to close it itself.
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
  /**
   * A menu its caller opens and closes, such as one that closes once a move it confirmed in place was applied: open while `true`, every
   * open and close the menu would make itself told to `onOpenChange` instead.
   */
  readonly isOpen?:        boolean;
  readonly onOpenChange?:  (isOpen: boolean) => void;
  readonly children:       ReactNode;
}

const CLOSES_MENU_ATTRIBUTE = 'data-closes-menu';

export function Menu({
  label, trigger, triggerContent, align, marked = false, triggerName, triggerTitle, triggerRef, isOpen, onOpenChange, children
}: MenuProps) {
  const [ownMenuIsOpen, setOwnMenuIsOpen] = useState(false);
  const menuIsOpen = isOpen ?? ownMenuIsOpen;
  const setMenuIsOpen = (open: boolean): void => {
    if (isOpen === undefined) setOwnMenuIsOpen(open);
    else onOpenChange?.(open);
  };
  const toggleMenu = (): void => {
    if (isOpen === undefined) setOwnMenuIsOpen((wasOpen) => !wasOpen);
    else onOpenChange?.(!isOpen);
  };
  const ownTriggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const popoverElementId = useId();
  const triggerElement = (): HTMLButtonElement | null => triggerRef?.current ?? ownTriggerRef.current;

  useDismissal({
    isOpen:      menuIsOpen,
    insideRefs:  [popoverRef, ownTriggerRef],
    escapePhase: 'capture',
    onDismiss:   (reason) => {
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
        onClick={toggleMenu}
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
  /** A muted line under the label saying what the item does; it describes the item and leaves its name to the label and hint. */
  readonly description?:  string;
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
  label, hint, description, title, pressed, checked, marked = false, dialogIsOpen, closing, onChoose
}: MenuItemProps) {
  const itemElementId = useId();
  const labelElementId = `${itemElementId}-label`;
  const hintElementId = `${itemElementId}-hint`;
  const descriptionElementId = `${itemElementId}-description`;
  const nameElementIds = hint === undefined ? labelElementId : `${labelElementId} ${hintElementId}`;
  return (
    <button
      type="button"
      className="bridge-menu-item"
      aria-pressed={checked ?? pressed}
      aria-haspopup={dialogIsOpen === undefined ? undefined : 'dialog'}
      aria-expanded={dialogIsOpen}
      aria-labelledby={description === undefined ? undefined : nameElementIds}
      aria-describedby={description === undefined ? undefined : descriptionElementId}
      data-marked={marked ? '' : undefined}
      title={title}
      data-closes-menu={closing === 'stays-open' ? undefined : closing}
      onClick={onChoose}
    >
      <span id={labelElementId}>{label}</span>
      {hint === undefined ? null : <span id={hintElementId} className="bridge-menu-hint">{hint}</span>}
      {checked === undefined ? null : <span className="bridge-menu-check" aria-hidden="true">✓</span>}
      {description === undefined ? null : <span id={descriptionElementId} className="bridge-menu-item-description">{description}</span>}
    </button>
  );
}

/** A line parting two groups of items. */
export function MenuSeparator() {
  return <div className="bridge-menu-separator" role="separator" />;
}
