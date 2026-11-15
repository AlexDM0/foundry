/**
 * A row of tabs with one selected. As links, each tab is a link and the selected one the current page; as a switch, the row is a tablist
 * whose selected tab alone takes the tab stop, or the first tab when no tab is the selected one. The arrow keys, Home and End move to a
 * tab and select it, as a click would; a tab may show a count badge after its label, and then its accessible name says what the count
 * means.
 */
import { useRef, type KeyboardEvent, type ReactElement } from 'react';

import type { CountBadgeProps } from '../atoms/CountBadge.tsx';
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

/** A tab of the links: a link that leads to its `href`. */
export interface LinkTabItem<Key extends string> extends TabItem<Key> {
  readonly href: string;
}

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

function TabContent<Key extends string>({ item }: { readonly item: TabItem<Key> }) {
  return (
    <>
      {item.label}
      {item.countBadge}
    </>
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
        {items.map((item, position) => (
          <a
            key={item.key}
            ref={keepElement(position)}
            className="design-system-tab"
            href={item.href}
            aria-current={item.key === selectedKey ? 'page' : undefined}
            aria-label={item.accessibleName}
          >
            <TabContent item={item} />
          </a>
        ))}
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
