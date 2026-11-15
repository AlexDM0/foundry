/**
 * The data table, in a happy-dom document. What matters: it is a table named by its label; the head row holds the column headers and each
 * row its cells in column order, every row on the same grid tracks; only the selected row is current; an expanded row is marked in the
 * muted tone and is not current; content under a row spans every column; an end-aligned column, a hidden head label and an interactive row
 * are marked; and the row height, column gap and inset are the table's, with the regular ones left unmarked.
 */
import {
  cleanup,
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

import { DataTable, type DataTableProps } from './DataTable.tsx';

type ExampleColumn = 'name' | 'count' | 'controls';

const COLUMN_WIDTHS = 'minmax(0, 1fr) 116px 80px';

function tableOf(options: Partial<Pick<DataTableProps<ExampleColumn>, 'rowHeight' | 'columnGap' | 'inset'>> = {}) {
  return render(
    <DataTable<ExampleColumn>
      label="Projects"
      columns={[{ key: 'name', label: 'Name' }, { key: 'count', label: 'Count', align: 'end' }, { key: 'controls', label: 'Controls', labelHidden: true }]}
      columnWidths={COLUMN_WIDTHS}
      rows={[
        {
          key: 'storefront', cells: { name: 'Example Storefront', count: '4', controls: 'Open' }, selected: true, below: 'Archive Example Storefront?'
        },
        { key: 'invoices', cells: { name: 'Example Invoices', count: '3', controls: 'Open' }, interactive: true },
      ]}
      {...options}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe('the data table', () => {
  test('the head holds the column headers and each row its cells in column order, all on the same tracks', () => {
    tableOf();
    const table = screen.getByRole('table', { name: 'Projects' });
    const rows = within(table).getAllByRole('row');
    expect(rows.map((row) => [...within(row).queryAllByRole('columnheader'), ...within(row).queryAllByRole('cell')].map((cell) => cell.textContent))).toEqual([
      ['Name', 'Count', 'Controls'],
      ['Example Storefront', '4', 'Open', 'Archive Example Storefront?'],
      ['Example Invoices', '3', 'Open'],
    ]);
    const tracks = [...table.querySelectorAll<HTMLElement>('[role="none"]')].map((cells) => cells.style.gridTemplateColumns);
    expect(new Set(tracks).size).toBe(1);
    expect(tracks).toHaveLength(3);
  });

  test('only the selected row is current, and content under a row spans every column', () => {
    tableOf();
    const [, selected, other] = screen.getAllByRole('row');
    expect([selected?.getAttribute('aria-current'), other?.getAttribute('aria-current') ?? null]).toEqual(['true', null]);
    const below = screen.getByText('Archive Example Storefront?');
    expect([below.getAttribute('role'), below.getAttribute('aria-colspan')]).toEqual(['cell', '3']);
  });

  test('an expanded row is marked in the muted tone and is not current, so its faded edge is no selection', () => {
    render(
      <DataTable
        label="Projects"
        columns={[{ key: 'name', label: 'Name' }]}
        columnWidths="minmax(0, 1fr)"
        rows={[{
          key: 'storefront', cells: { name: 'Example Storefront' }, expanded: true, below: 'Example Storefront is ahead.'
        }, { key: 'invoices', cells: { name: 'Example Invoices' } }]}
      />,
    );
    const [, expanded, other] = screen.getAllByRole('row');
    expect([expanded?.hasAttribute('data-expanded'), expanded?.getAttribute('data-state-tone'), expanded?.getAttribute('aria-current') ?? null]).toEqual([true, 'muted', null]);
    expect([other?.hasAttribute('data-expanded'), other?.hasAttribute('data-state-tone')]).toEqual([false, false]);
  });

  test('an end-aligned column, a hidden head label and an interactive row are marked', () => {
    tableOf();
    const [head, selected, interactive] = screen.getAllByRole('row');
    expect(screen.getAllByText(/^(Count|4|3)$/).map((cell) => cell.getAttribute('data-align'))).toEqual(['end', 'end', 'end']);
    expect(within(head ?? document.body).getAllByRole('columnheader').map((header) => header.hasAttribute('data-hidden'))).toEqual([false, false, true]);
    expect([selected?.hasAttribute('data-interactive'), interactive?.hasAttribute('data-interactive')]).toEqual([false, true]);
  });

  test('the row height, column gap and inset are the table\'s, and the regular gap and inset are unmarked', () => {
    tableOf();
    const regular = screen.getByRole('table');
    expect([regular.getAttribute('data-row-height'), regular.hasAttribute('data-column-gap'), regular.hasAttribute('data-inset')]).toEqual(['regular', false, false]);
    cleanup();
    tableOf({ rowHeight: 'compact', columnGap: 'narrow', inset: 'wide' });
    const compact = screen.getByRole('table');
    expect([compact.getAttribute('data-row-height'), compact.getAttribute('data-column-gap'), compact.getAttribute('data-inset')]).toEqual(['compact', 'narrow', 'wide']);
  });
});
