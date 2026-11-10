/**
 * The tabs, in a happy-dom document. What matters: as links, the selected tab is the current page and each leads to its href; the arrow
 * keys, Home and End call `onSelect` with the tab they reach and move the focus there, wrapping; as a switch, the row is a tablist whose
 * selected tab alone takes the tab stop and a click selects; a count shows as a count badge under the tab's accessible name; and a label
 * is text, never markup.
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

import { Tabs, type TabItem } from './Tabs.tsx';

type ExampleTab = 'kanban' | 'waves' | 'progress';

const LINK_ITEMS: readonly TabItem<ExampleTab>[] = [
  { key: 'kanban', label: 'Kanban', href: '#kanban' },
  { key: 'waves', label: 'Waves', href: '#waves' },
  { key: 'progress', label: 'Progress', href: '#progress' },
];

function renderTabs(mode: 'links' | 'switch', selected: string[], items: readonly TabItem<ExampleTab>[] = LINK_ITEMS): void {
  render(<Tabs label="Example views" items={items} selectedKey="waves" mode={mode} size="page" onSelect={(key) => selected.push(key)} />);
}

afterEach(() => {
  cleanup();
});

describe('the tabs as links', () => {
  test('the selected tab is the current page and each tab leads to its href', () => {
    renderTabs('links', []);
    const links = screen.getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href'), link.getAttribute('aria-current')])).toEqual([
      ['Kanban', '#kanban', null],
      ['Waves', '#waves', 'page'],
      ['Progress', '#progress', null],
    ]);
    expect(screen.getByRole('navigation', { name: 'Example views' }).getAttribute('data-size')).toBe('page');
  });

  test('ArrowRight, ArrowLeft, Home and End select the tab they reach and move the focus there, wrapping', () => {
    const selected: string[] = [];
    renderTabs('links', selected);
    const [kanban, , progress] = screen.getAllByRole('link');
    fireEvent.keyDown(progress ?? document.body, { key: 'ArrowRight' });
    expect([selected, document.activeElement?.textContent]).toEqual([['kanban'], 'Kanban']);
    fireEvent.keyDown(kanban ?? document.body, { key: 'ArrowLeft' });
    fireEvent.keyDown(kanban ?? document.body, { key: 'End' });
    fireEvent.keyDown(progress ?? document.body, { key: 'Home' });
    expect([selected, document.activeElement?.textContent]).toEqual([['kanban', 'progress', 'progress', 'kanban'], 'Kanban']);
  });
});

describe('the tabs as a switch', () => {
  test('the row is a tablist whose selected tab alone takes the tab stop, and a click selects', () => {
    const selected: string[] = [];
    renderTabs('switch', selected, LINK_ITEMS.map(({ key, label }) => ({ key, label })));
    const tabs = screen.getAllByRole('tab');
    expect(screen.getByRole('tablist', { name: 'Example views' })).toBeDefined();
    expect(tabs.map((tab) => [tab.getAttribute('aria-selected'), tab.tabIndex])).toEqual([['false', -1], ['true', 0], ['false', -1]]);
    fireEvent.click(tabs[2] ?? document.body);
    fireEvent.keyDown(tabs[1] ?? document.body, { key: 'ArrowRight' });
    expect([selected, document.activeElement?.textContent]).toEqual([['progress', 'progress'], 'Progress']);
  });
});

describe('a tab\'s count', () => {
  test('shows as a count badge, and the accessible name says what it counts', () => {
    renderTabs('links', [], [
      { key: 'kanban', label: 'Kanban', href: '#kanban' },
      {
        key: 'waves', label: 'Questions', href: '#questions', count: { count: 3, tone: 'warn' }, accessibleName: 'Questions, 3 waiting on User',
      },
    ]);
    const counted = screen.getByRole('link', { name: 'Questions, 3 waiting on User' });
    expect([counted.querySelector('.bridge-count-badge')?.textContent, counted.querySelector('.bridge-count-badge')?.getAttribute('data-tone')]).toEqual(['3', 'warn']);
    expect(screen.getByRole('link', { name: 'Kanban' }).querySelector('.bridge-count-badge')).toBeNull();
  });

  test('a label is text, never markup', () => {
    const items = [{ key: 'kanban', label: '<b>planted</b>', href: '#kanban' }] as const;
    render(<Tabs label="Example views" items={items} selectedKey="kanban" mode="links" size="section" onSelect={() => undefined} />);
    const link = screen.getByRole('link', { name: '<b>planted</b>' });
    expect([link.querySelector('b'), screen.getByRole('navigation').getAttribute('data-size')]).toEqual([null, 'section']);
  });
});
