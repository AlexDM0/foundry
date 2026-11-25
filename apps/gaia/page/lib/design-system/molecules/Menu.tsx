/**
 * A menu: a trigger button that opens a small popover of items under itself. It closes as any popover does, its Esc caught before a side
 * panel's own and the focus back on the trigger, and an item closes it by its `closing`. The insert trigger is a round plus on a line,
 * named by `triggerName`, that pulses while closed and opens its popover beside itself. The segment trigger sits as the last segment of a
 * `SegmentedControl` tray, pressed while the tray's choice is one of its items. The caret trigger is a small chevron beside what it opens
 * alternatives to, such as a tab, named by `triggerName`. The popover drops in on open and leaves the same way, inert while it goes.
 */
import {
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject
} from 'react';

import { useDismissal } from '../utils/Dismissal.ts';
import { usePresence }  from '../utils/Presence.ts';

/**
 * `outlined` a bordered trigger holding its summary, `icon` a quiet square glyph trigger, `button` a trigger in the button's look, `insert`
 * a round plus that adds something where it sits, `segment` a segment of the `SegmentedControl` tray it trails, `caret` a quiet chevron
 * beside what it offers alternatives to.
 */
export type MenuTrigger = 'outlined' | 'icon' | 'button' | 'insert' | 'segment' | 'caret';

/** `solid` in the link colour, `dashed` in a quiet grey. */
export type MenuInsertStyle = 'solid' | 'dashed';

/**
 * How an item closes the menu: `return-focus` hands the focus back to the trigger, `keep-focus` leaves it to whatever the item opened, and
 * `stays-open`, a toggle, leaves the menu open.
 */
export type MenuItemClosing = 'return-focus' | 'keep-focus' | 'stays-open';

export interface MenuProps {
  /** The menu's accessible name. */
  readonly label:           string;
  readonly trigger:         MenuTrigger;
  /** What the trigger holds; the insert and caret triggers draw their own glyph and show none. */
  readonly triggerContent?: ReactNode;
  /** The insert trigger's look; it needs the `insert` trigger. */
  readonly insertStyle?:    MenuInsertStyle;
  /** A micro-caps line over the items, such as where an inserted step goes. */
  readonly heading?:        string;
  /** Which edge of the trigger the popover lines up with. */
  readonly align:           'start' | 'end';
  /** A dot on the trigger, such as the one saying the rows changed under a held range. */
  readonly marked?:         boolean;
  /** The segment trigger drawn pressed, as the tray's choice is one of its items; it needs the `segment` trigger. */
  readonly pressed?:        boolean;
  /** A popover as wide as the confirmations its items open in place, never wider than the window. */
  readonly wide?:           boolean;
  /** The trigger's accessible name when its content is a glyph rather than words. */
  readonly triggerName?:    string;
  readonly triggerTitle?:   string;
  /** Lets the caller hand the focus back to the trigger after a popover the menu opened. */
  readonly triggerRef?:     RefObject<HTMLButtonElement | null>;
  /**
   * A menu its caller opens and closes, such as one that closes once a move it confirmed in place was applied: open while `true`, every
   * open and close the menu would make itself told to `onOpenChange` instead.
   */
  readonly isOpen?:         boolean;
  readonly onOpenChange?:   (isOpen: boolean) => void;
  readonly children:        ReactNode;
}

const CLOSES_MENU_ATTRIBUTE = 'data-closes-menu';

export function Menu({
  label, trigger, triggerContent, insertStyle, heading, align, marked = false, pressed = false, wide = false, triggerName, triggerTitle,
  triggerRef, isOpen, onOpenChange, children
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
  const { isShown, isLeaving } = usePresence(menuIsOpen, popoverRef);

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
    <div className="design-system-menu" data-trigger={trigger}>
      <button
        ref={(element) => {
          ownTriggerRef.current = element;
          if (triggerRef !== undefined) triggerRef.current = element;
        }}
        type="button"
        className={trigger === 'button' ? 'design-system-menu-button design-system-button' : 'design-system-menu-button'}
        data-trigger={trigger}
        data-insert={trigger === 'insert' ? insertStyle ?? 'solid' : undefined}
        data-marked={marked ? '' : undefined}
        aria-pressed={trigger === 'segment' ? pressed : undefined}
        aria-label={triggerName}
        aria-haspopup="dialog"
        aria-expanded={menuIsOpen}
        aria-controls={popoverElementId}
        title={triggerTitle}
        onClick={toggleMenu}
      >
        {trigger === 'insert'
          ? (
            <svg className="design-system-menu-insert-glyph" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M6 1.5v9 M1.5 6h9" />
            </svg>
          )
          : null}
        {trigger === 'caret'
          ? (
            <svg className="design-system-menu-caret-glyph" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2.5 4 L5 6.5 L7.5 4" />
            </svg>
          )
          : null}
        {trigger === 'insert' || trigger === 'caret' ? null : triggerContent}
      </button>
      {/* The items are buttons; their click is read as it bubbles, to close the menu after the item acted. */}
      <div
        ref={popoverRef}
        id={popoverElementId}
        className="design-system-menu-popover"
        data-trigger={trigger}
        data-align={align}
        data-wide={wide ? '' : undefined}
        role="dialog"
        aria-label={label}
        hidden={!isShown}
        data-motion={isLeaving ? 'out' : undefined}
        inert={isLeaving}
        onClick={closeOnChoice}
      >
        {isShown && heading !== undefined ? <span className="design-system-menu-heading">{heading}</span> : null}
        {isShown ? children : null}
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
      className="design-system-menu-item"
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
      {hint === undefined ? null : <span id={hintElementId} className="design-system-menu-hint">{hint}</span>}
      {checked === undefined ? null : <span className="design-system-menu-check" aria-hidden="true">✓</span>}
      {description === undefined ? null : <span id={descriptionElementId} className="design-system-menu-item-description">{description}</span>}
    </button>
  );
}

/** A line parting two groups of items. */
export function MenuSeparator() {
  return <div className="design-system-menu-separator" role="separator" />;
}
