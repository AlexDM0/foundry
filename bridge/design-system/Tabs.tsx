/**
 * A row of tabs with one selected. As links, each tab is a link and the selected one the current page; as a switch, the row is a tablist
 * whose selected tab alone takes the tab stop. The arrow keys, Home and End move to a tab and select it, as a click would; a tab may show a
 * count after its label, and then its accessible name says what the count means.
 */
import { useRef, type KeyboardEvent } from 'react';

import { CountBadge, type CountBadgeProps } from './CountBadge.tsx';
import { RovingFocusUtil }                  from './utils/RovingFocusUtil.ts';

export interface TabItem<Key extends string> {
  readonly key:             Key;
  readonly label:           string;
  /** Where a links-mode tab leads. */
  readonly href?:           string;
  readonly count?:          CountBadgeProps;
  /** Set only where a count shows, so the name says what it counts. */
  readonly accessibleName?: string;
}

export interface TabsProps<Key extends string> {
  readonly label:       string;
  readonly items:       readonly TabItem<Key>[];
  readonly selectedKey: Key;
  /** `links` a nav of links, the selected one the current page; `switch` a tablist of buttons. */
  readonly mode:        'links' | 'switch';
  /** `page` the board's own tabs, `section` the smaller tabs of a panel. */
  readonly size:        'page' | 'section';
  /** A click on a link follows its href; the arrow keys call this in both modes, a click only in switch mode. */
  readonly onSelect:    (key: Key) => void;
}

function TabContent<Key extends string>({ item }: { readonly item: TabItem<Key> }) {
  return (
    <>
      {item.label}
      {item.count === undefined ? null : <CountBadge {...item.count} />}
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
      <nav className="bridge-tabs" aria-label={label} data-mode={mode} data-size={size} onKeyDown={moveTab}>
        {items.map((item, position) => (
          <a
            key={item.key}
            ref={keepElement(position)}
            className="bridge-tab"
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
  return (
    <div className="bridge-tabs" role="tablist" aria-label={label} data-mode={mode} data-size={size} onKeyDown={moveTab}>
      {items.map((item, position) => (
        <button
          key={item.key}
          ref={keepElement(position)}
          type="button"
          role="tab"
          className="bridge-tab"
          aria-selected={item.key === selectedKey}
          aria-label={item.accessibleName}
          tabIndex={item.key === selectedKey ? 0 : -1}
          onClick={() => onSelect(item.key)}
        >
          <TabContent item={item} />
        </button>
      ))}
    </div>
  );
}
