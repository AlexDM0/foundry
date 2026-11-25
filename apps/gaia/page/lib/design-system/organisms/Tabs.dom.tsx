/**
 * The tabs, in a happy-dom document. What matters: as links, the selected tab is the current page and each leads to its href; the arrow
 * keys, Home and End call `onSelect` with the tab they reach and move the focus there, wrapping; as a switch, the row is a tablist whose
 * selected tab alone takes the tab stop, the first tab taking it when the selected key is among no tab, and a click selects; a count
 * shows as a count badge under the tab's accessible name; a link tab's sub-label follows its label, and its menu opens while a mouse rests on
 * the tab and closes as it leaves, or from its caret, where it stays open until dismissed, a touch opening nothing; a links tab without
 * an `href` and a switch tab with one do not compile; and a label is text, never markup.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { CountBadge }                           from '../atoms/CountBadge.tsx';
import { MenuItem }                             from '../molecules/Menu.tsx';
import { Tabs, type LinkTabItem, type TabItem } from './Tabs.tsx';

type ExampleTab = 'overview' | 'waves' | 'progress';

const LINK_ITEMS: readonly LinkTabItem<ExampleTab>[] = [
  { key: 'overview', label: 'Overview', href: '#overview' },
  { key: 'waves', label: 'Waves', href: '#waves' },
  { key: 'progress', label: 'Progress', href: '#progress' },
];

function renderLinkTabs(selected: string[], items: readonly LinkTabItem<ExampleTab>[] = LINK_ITEMS): void {
  render(<Tabs label="Example views" items={items} selectedKey="waves" mode="links" size="page" onSelect={(key) => selected.push(key)} />);
}

function renderSwitchTabs(selected: string[], items: readonly TabItem<ExampleTab>[]): void {
  render(<Tabs label="Example views" items={items} selectedKey="waves" mode="switch" size="page" onSelect={(key) => selected.push(key)} />);
}

afterEach(() => {
  cleanup();
});

describe('the tabs as links', () => {
  test('the selected tab is the current page and each tab leads to its href', () => {
    renderLinkTabs([]);
    const links = screen.getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href'), link.getAttribute('aria-current')])).toEqual([
      ['Overview', '#overview', null],
      ['Waves', '#waves', 'page'],
      ['Progress', '#progress', null],
    ]);
    expect(screen.getByRole('navigation', { name: 'Example views' }).getAttribute('data-size')).toBe('page');
  });

  test('ArrowRight, ArrowLeft, Home and End select the tab they reach and move the focus there, wrapping', () => {
    const selected: string[] = [];
    renderLinkTabs(selected);
    const [overview, , progress] = screen.getAllByRole('link');
    fireEvent.keyDown(progress ?? document.body, { key: 'ArrowRight' });
    expect([selected, document.activeElement?.textContent]).toEqual([['overview'], 'Overview']);
    fireEvent.keyDown(overview ?? document.body, { key: 'ArrowLeft' });
    fireEvent.keyDown(overview ?? document.body, { key: 'End' });
    fireEvent.keyDown(progress ?? document.body, { key: 'Home' });
    expect([selected, document.activeElement?.textContent]).toEqual([['overview', 'progress', 'progress', 'overview'], 'Overview']);
  });
});

describe('the tabs as a switch', () => {
  test('the row is a tablist whose selected tab alone takes the tab stop, and a click selects', () => {
    const selected: string[] = [];
    renderSwitchTabs(selected, LINK_ITEMS.map(({ key, label }) => ({ key, label })));
    const tabs = screen.getAllByRole('tab');
    expect(screen.getByRole('tablist', { name: 'Example views' })).toBeDefined();
    expect(tabs.map((tab) => [tab.getAttribute('aria-selected'), tab.tabIndex])).toEqual([['false', -1], ['true', 0], ['false', -1]]);
    fireEvent.click(tabs[2] ?? document.body);
    fireEvent.keyDown(tabs[1] ?? document.body, { key: 'ArrowRight' });
    expect([selected, document.activeElement?.textContent]).toEqual([['progress', 'progress'], 'Progress']);
  });

  test('a selected key that is among no tab leaves the first tab the tab stop, so the tablist stays in reach of the keyboard', () => {
    renderSwitchTabs([], LINK_ITEMS.filter(({ key }) => key !== 'waves').map(({ key, label }) => ({ key, label })));
    expect(screen.getAllByRole('tab').map((tab) => [tab.getAttribute('aria-selected'), tab.tabIndex])).toEqual([['false', 0], ['false', -1]]);
  });
});

describe('a tab\'s count', () => {
  test('shows as a count badge, and the accessible name says what it counts', () => {
    renderLinkTabs([], [
      { key: 'overview', label: 'Overview', href: '#overview' },
      {
        key: 'waves', label: 'Questions', href: '#questions', countBadge: <CountBadge count={3} tone="warn" />, accessibleName: 'Questions, 3 waiting on User',
      },
    ]);
    const counted = screen.getByRole('link', { name: 'Questions, 3 waiting on User' });
    const badge = counted.querySelector('.design-system-count-badge');
    expect([badge?.textContent, badge?.getAttribute('data-tone')]).toEqual(['3', 'warn']);
    expect(screen.getByRole('link', { name: 'Overview' }).querySelector('.design-system-count-badge')).toBeNull();
  });

  test('a label is text, never markup', () => {
    const items = [{ key: 'overview', label: '<b>planted</b>', href: '#overview' }] as const;
    render(<Tabs label="Example views" items={items} selectedKey="overview" mode="links" size="section" onSelect={() => undefined} />);
    const link = screen.getByRole('link', { name: '<b>planted</b>' });
    expect([link.querySelector('b'), screen.getByRole('navigation').getAttribute('data-size')]).toEqual([null, 'section']);
  });
});

const MENU_ITEMS: readonly LinkTabItem<ExampleTab>[] = [
  { key: 'overview', label: 'Overview', href: '#overview' },
  {
    key:       'progress',
    label:     'Progress',
    href:      '#progress/chart',
    subLabel:  'Chart',
    menuLabel: 'Progress views',
    menuItems: <MenuItem label="Table" closing="return-focus" onChoose={() => undefined} />,
  },
];

function renderMenuTabs(): { readonly caret: HTMLElement; readonly group: Element; readonly menu: () => HTMLElement | null } {
  render(
    <>
      <Tabs label="Example views" items={MENU_ITEMS} selectedKey="overview" mode="links" size="page" onSelect={() => undefined} />
      <button type="button">Outside</button>
    </>,
  );
  const caret = screen.getByRole('button', { name: 'Progress views' });
  return { caret, group: caret.closest('.design-system-tab-group') ?? document.body, menu: () => screen.queryByRole('dialog', { name: 'Progress views' }) };
}

describe('a link tab\'s sub-label and menu', () => {
  test('the sub-label follows the label after a dot hidden from the accessible name, and the tab still leads to its href', () => {
    renderMenuTabs();
    const tab = screen.getByRole('link', { name: 'Progress Chart' });
    expect([tab.getAttribute('href'), tab.querySelector('.design-system-tab-sub-label [aria-hidden="true"]')?.textContent]).toEqual(['#progress/chart', '·']);
  });

  test('a resting mouse opens the menu and leaving the tab closes it, while a touch opens nothing', () => {
    const { group, menu } = renderMenuTabs();
    fireEvent.pointerOver(group, { pointerType: 'touch' });
    expect(menu()).toBeNull();
    fireEvent.pointerOut(group, { pointerType: 'touch', relatedTarget: document.body });
    fireEvent.pointerOver(group, { pointerType: 'mouse' });
    expect(menu()).not.toBeNull();
    fireEvent.pointerOut(group, { pointerType: 'mouse', relatedTarget: document.body });
    expect(menu()).toBeNull();
  });

  test('the caret opens the menu for the keyboard and touch, and it stays open until dismissed', () => {
    const { caret, group, menu } = renderMenuTabs();
    fireEvent.click(caret);
    expect([caret.getAttribute('aria-expanded'), menu() === null]).toEqual(['true', false]);
    fireEvent.pointerOut(group, { pointerType: 'mouse', relatedTarget: document.body });
    expect(menu()).not.toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect([menu(), document.activeElement]).toEqual([null, caret]);
  });

  test('a press on the caret of a menu a resting mouse opened keeps it open after the mouse leaves', () => {
    const { caret, group, menu } = renderMenuTabs();
    fireEvent.pointerOver(group, { pointerType: 'mouse' });
    fireEvent.pointerDown(caret, { pointerType: 'mouse' });
    fireEvent.click(caret);
    fireEvent.pointerOut(group, { pointerType: 'mouse', relatedTarget: document.body });
    expect(menu()).not.toBeNull();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    expect(menu()).toBeNull();
  });
});

describe('a tab\'s href follows the mode', () => {
  test('a links tab without an href and a switch tab with one do not compile', () => {
    const tabWithoutHref = [{ key: 'overview', label: 'Overview' }] as const;
    const tabWithHref = [{ key: 'overview', label: 'Overview', href: '#overview' }] as const;
    // @ts-expect-error a links tab is a link, so it leads somewhere
    const linkWithoutHref = <Tabs label="Example views" items={tabWithoutHref} selectedKey="overview" mode="links" size="page" onSelect={() => undefined} />;
    // @ts-expect-error a switch tab is a button, so it leads nowhere
    const switchWithHref = <Tabs label="Example views" items={tabWithHref} selectedKey="overview" mode="switch" size="page" onSelect={() => undefined} />;
    expect([linkWithoutHref, switchWithHref]).toHaveLength(2);
  });
});
