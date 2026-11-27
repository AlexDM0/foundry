/**
 * A row of tabs with one selected: as links, each a link and the selected one the current page; as a switch, a tablist whose selected tab, or
 * else the first, takes the tab stop. Arrows, Home and End select as a click would; a count badge's meaning is in the accessible name. A link tab
 * may offer its other places in a menu, opened while a mouse rests on it, or by its caret for the keyboard and touch.
 */
import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type RefCallback
} from 'react';

import type { CountBadgeProps } from '../atoms/CountBadge.tsx';
import { Menu }                 from '../molecules/Menu.tsx';
import { RovingFocusUtil }      from '../utils/RovingFocusUtil.ts';

/** A tab of the switch: a button that selects its key. */
export interface TabItem<Key extends string> {
  readonly key:             Key;
  readonly label:           string;
  /** A `CountBadge` after the label, composed by the caller: `<CountBadge count={3} tone="warn" />`. */
  readonly countBadge?:     ReactElement<CountBadgeProps>;
  /** Set only where a count shows, so the name says what it counts. */
  readonly accessibleName?: string;
}

/** A link tab's menu of its other places: `MenuItem`s, under the menu's and its caret's accessible name. */
type TabMenuFields =
  | { readonly menuLabel: string; readonly menuItems: ReactNode }
  | { readonly menuLabel?: never; readonly menuItems?: never };

/** A tab of the links: a link that leads to its `href`. */
export type LinkTabItem<Key extends string> = TabItem<Key> & TabMenuFields & {
  readonly href:      string;
  /** A muted word after the label, after a dot: which of the tab's places it opens. */
  readonly subLabel?: string;
};

/** `links` a nav of links, the selected one the current page, each tab with its `href`; `switch` a tablist of buttons, no tab with one. */
export type TabsMode<Key extends string> =
  | { readonly mode: 'links'; readonly items: readonly LinkTabItem<Key>[] }
  | { readonly mode: 'switch'; readonly items: readonly (TabItem<Key> & { readonly href?: never })[] };

export type TabsProps<Key extends string> = TabsMode<Key> & {
  readonly label:       string;
  readonly selectedKey: Key;
  /** `page` the tabs of a page, `section` the smaller tabs of a panel. */
  readonly size:        'page' | 'section';
  /** A click on a link follows its href; the arrow keys call this in both modes, a click only in switch mode. */
  readonly onSelect:    (key: Key) => void;
};

function TabContent<Key extends string>({ item, subLabel }: { readonly item: TabItem<Key>; readonly subLabel?: string | undefined }) {
  return (
    <>
      {item.label}
      {subLabel === undefined
        ? null
        : (
          <span className="design-system-tab-sub-label">
            <span aria-hidden="true">·</span>
            {subLabel}
          </span>
        )}
      {item.countBadge}
    </>
  );
}

/** Who opened a tab's menu: a resting mouse, which leaving closes it, or its caret, which keeps it until it is dismissed. */
type TabMenuOpener = 'pointer' | 'caret';

interface LinkTabProps<Key extends string> {
  readonly item:       LinkTabItem<Key>;
  readonly isSelected: boolean;
  readonly tabRef:     RefCallback<HTMLElement>;
}

function LinkTab<Key extends string>({ item, isSelected, tabRef }: LinkTabProps<Key>) {
  const [menuOpener, setMenuOpener] = useState<TabMenuOpener | null>(null);
  const caretWasPressed = useRef(false);
  const link = (
    <a
      ref={tabRef}
      className="design-system-tab"
      href={item.href}
      aria-current={isSelected ? 'page' : undefined}
      aria-label={item.accessibleName}
    >
      <TabContent item={item} subLabel={item.subLabel} />
    </a>
  );
  if (item.menuLabel === undefined) return link;
  const openOnRest = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === 'mouse' && menuOpener === null) setMenuOpener('pointer');
  };
  const closeOnLeave = (): void => {
    if (menuOpener === 'pointer') setMenuOpener(null);
  };
  // A press on the caret of a menu a resting mouse opened keeps it open; Esc or a press elsewhere closes it.
  const changeOpen = (isOpen: boolean): void => {
    const caretKeepsItOpen = !isOpen && menuOpener === 'pointer' && caretWasPressed.current;
    caretWasPressed.current = false;
    setMenuOpener(isOpen || caretKeepsItOpen ? 'caret' : null);
  };
  return (
    <div className="design-system-tab-group" onPointerEnter={openOnRest} onPointerLeave={closeOnLeave}>
      {link}
      <span
        className="design-system-tab-caret"
        onPointerDown={() => {
          caretWasPressed.current = true;
        }}
      >
        <Menu label={item.menuLabel} trigger="caret" triggerName={item.menuLabel} align="start" isOpen={menuOpener !== null} onOpenChange={changeOpen}>
          {item.menuItems}
        </Menu>
      </span>
    </div>
  );
}

export function Tabs<Key extends string>({
  label, items, selectedKey, mode, size, onSelect
}: TabsProps<Key>) {
  const tabElements = useRef<(HTMLElement | null)[]>([]);
  const moveTab = (event: KeyboardEvent<HTMLElement>): void => {
    const current = tabElements.current.findIndex((tab) => tab === event.target);
    if (current < 0) return;
    const position = RovingFocusUtil.targetIndexOf(event.key, current, items.length, 'horizontal');
    if (position === null) return;
    event.preventDefault();
    const item = items[position];
    if (item === undefined) return;
    tabElements.current[position]?.focus();
    onSelect(item.key);
  };
  const keepElement = (position: number) => (element: HTMLElement | null): void => {
    tabElements.current[position] = element;
  };

  if (mode === 'links') {
    return (
      <nav className="design-system-tabs" aria-label={label} data-mode={mode} data-size={size} onKeyDown={moveTab}>
        {items.map((item, position) => <LinkTab key={item.key} item={item} isSelected={item.key === selectedKey} tabRef={keepElement(position)} />)}
      </nav>
    );
  }
  const tabStopKey = items.some((item) => item.key === selectedKey) ? selectedKey : items[0]?.key;
  return (
    <div className="design-system-tabs" role="tablist" aria-label={label} data-mode={mode} data-size={size} onKeyDown={moveTab}>
      {items.map((item, position) => (
        <button
          key={item.key}
          ref={keepElement(position)}
          type="button"
          role="tab"
          className="design-system-tab"
          aria-selected={item.key === selectedKey}
          aria-label={item.accessibleName}
          tabIndex={item.key === tabStopKey ? 0 : -1}
          onClick={() => onSelect(item.key)}
        >
          <TabContent item={item} />
        </button>
      ))}
    </div>
  );
}
