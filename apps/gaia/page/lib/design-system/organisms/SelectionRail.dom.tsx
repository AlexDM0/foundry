/**
 * The selection rail: the leading rows, then the grouped rows, each a named button; the selected row, or else the first, has the one tab stop; a
 * press gives its key; arrows, Home and End move the focus with wrapping and choose nothing; the filter reports its text; optional lines show
 * only when given; as a page it is a navigation, as a filter its row is pressed.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import {
  SelectionRail,
  type SelectionRailGroup,
  type SelectionRailMeaning,
  type SelectionRailRow
} from './SelectionRail.tsx';

afterEach(cleanup);

function exampleRow(key: string, selected = false): SelectionRailRow {
  return {
    key, accessibleName: `${key}, example kind`, selected, title: key, subtitle: 'example kind'
  };
}

const EXAMPLE_GROUPS: readonly SelectionRailGroup[] = [
  { key: 'first', label: 'First group', rows: [exampleRow('alpha', true), exampleRow('beta')] },
  { key: 'second', label: 'Second group', rows: [exampleRow('gamma')] },
];

interface RenderedRail {
  readonly selectedKeys:    string[];
  readonly typedFilterText: string[];
}

function renderRail(fields: {
  readonly groups?:        readonly SelectionRailGroup[];
  readonly meaning?:       SelectionRailMeaning;
  readonly attentionText?: string | null;
  readonly noMatchText?:   string | null;
  readonly note?:          string | null;
} = {}): RenderedRail {
  const rendered: RenderedRail = { selectedKeys: [], typedFilterText: [] };
  render(
    <SelectionRail
      label="Example places"
      filterLabel="Filter places"
      filterText=""
      onFilterTextChange={(text) => rendered.typedFilterText.push(text)}
      leadingRows={[exampleRow('everything')]}
      groups={fields.groups ?? EXAMPLE_GROUPS}
      onSelect={(rowKey) => rendered.selectedKeys.push(rowKey)}
      attentionText={fields.attentionText ?? null}
      noMatchText={fields.noMatchText ?? null}
      note={fields.note ?? null}
      {...fields.meaning === undefined ? {} : { meaning: fields.meaning }}
    />,
  );
  return rendered;
}

function rowButtons(): HTMLElement[] {
  return screen.getAllByRole('button');
}

describe('the selection rail', () => {
  test('the leading rows lead, and every other row is a button in its labelled group, named by its accessible name', () => {
    renderRail();
    expect(rowButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
      'everything, example kind',
      'alpha, example kind',
      'beta, example kind',
      'gamma, example kind',
    ]);
    expect(within(screen.getByRole('group', { name: 'First group' })).getAllByRole('button')).toHaveLength(2);
    expect(within(screen.getByRole('group', { name: 'Second group' })).getByRole('button').textContent).toContain('gamma');
  });

  test('as the current page, the column is a navigation, and the selected row is current with the look and the one tab stop', () => {
    renderRail();
    expect(screen.getByRole('navigation', { name: 'Example places' })).toBeDefined();
    const [everything, alpha] = rowButtons();
    expect(alpha?.getAttribute('aria-current')).toBe('page');
    expect(alpha?.hasAttribute('data-selected')).toBe(true);
    expect(alpha?.hasAttribute('aria-pressed')).toBe(false);
    expect(alpha?.tabIndex).toBe(0);
    expect(everything?.tabIndex).toBe(-1);
    expect(everything?.hasAttribute('aria-current')).toBe(false);
  });

  test('as a filter, the column is a region and the selected row is pressed, the others not', () => {
    renderRail({ meaning: 'pressed' });
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByRole('region', { name: 'Example places' })).toBeDefined();
    expect(rowButtons().map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false']);
    expect(rowButtons().some((button) => button.hasAttribute('aria-current'))).toBe(false);
  });

  test('with no row selected, the first row takes the tab stop', () => {
    renderRail({ groups: [{ key: 'first', label: 'First group', rows: [exampleRow('alpha')] }] });
    expect(rowButtons().map((button) => button.tabIndex)).toEqual([0, -1]);
  });

  test('a press gives the row\'s key', () => {
    const { selectedKeys } = renderRail();
    rowButtons()[3]?.click();
    rowButtons()[0]?.click();
    expect(selectedKeys).toEqual(['gamma', 'everything']);
  });

  test('the arrow keys, Home and End move the focus between rows and wrap, and choose nothing', () => {
    const { selectedKeys } = renderRail();
    const buttons = rowButtons();
    buttons[1]?.focus();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(buttons[2] ?? null);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'End' });
    expect(document.activeElement).toBe(buttons[3] ?? null);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(buttons[0] ?? null);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(buttons[3] ?? null);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Home' });
    expect(document.activeElement).toBe(buttons[0] ?? null);
    expect(selectedKeys).toEqual([]);
  });

  test('the filter field reports its text', () => {
    const { typedFilterText } = renderRail();
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter places' }), { target: { value: 'gam' } });
    expect(typedFilterText).toEqual(['gam']);
  });

  test('the attention line, the no-match line and the note show only when given, as text', () => {
    renderRail();
    expect(screen.queryByText('Example attention')).toBeNull();
    expect(screen.queryByText('Nothing matches.')).toBeNull();
    expect(screen.queryByText('Example note')).toBeNull();
    cleanup();
    renderRail({ attentionText: 'Example attention', noMatchText: 'Nothing matches.', note: '<b>Example note</b>' });
    expect(screen.getByText('Example attention')).toBeDefined();
    expect(screen.getByText('Nothing matches.')).toBeDefined();
    expect(screen.getByText('<b>Example note</b>')).toBeDefined();
  });
});
