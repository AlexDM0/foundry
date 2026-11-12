/**
 * The data table. What matters: the head row holds the column labels and each row its cells in column order, every row on the same grid
 * tracks; a selected row is marked and current; content under a row spans every column; an end-aligned column and tall rows are marked.
 */
import { describe, expect, test } from 'bun:test';

import { type HostElement, ReactElementTree } from '../testing/ReactElementTree.ts';
import { DataTable }                          from './DataTable.tsx';

type ForgeColumn = 'forge' | 'agents';

const COLUMNS = [
  { key: 'forge', label: 'Forge' },
  { key: 'agents', label: 'Agents', align: 'end' },
] as const;

const COLUMN_WIDTHS = 'minmax(0, 1fr) 116px';

function tableOf(rowHeight?: 'regular' | 'tall') {
  return ReactElementTree.unfolded(
    <DataTable<ForgeColumn>
      label="Forges"
      columns={COLUMNS}
      columnWidths={COLUMN_WIDTHS}
      {...(rowHeight === undefined ? {} : { rowHeight })}
      rows={[
        {
          key: 'example-storefront', cells: { forge: 'Example Storefront', agents: '4 / 5' }, selected: true, below: 'Stop the Overseer of Example Storefront?'
        },
        { key: 'invoice-service', cells: { forge: 'Invoice Service', agents: '3 / 5' } },
      ]}
    />,
  );
}

describe('the data table', () => {
  test('the head row holds the labels and each row its cells in column order, all on the same tracks', () => {
    const unfolded = tableOf();
    expect(ReactElementTree.onlyWithClass(unfolded, 'gaia-table').props['aria-label']).toBe('Forges');
    const rows = ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('gaia-table-row'));
    const cellsOf = (row: HostElement) => ReactElementTree.hostElementsIn([row], ReactElementTree.withClass('gaia-table-cell'));
    expect(rows.map((row) => cellsOf(row).map((cell) => [cell.props['role'], ReactElementTree.textOf([cell])]))).toEqual([
      [['columnheader', 'Forge'], ['columnheader', 'Agents']],
      [['cell', 'Example Storefront'], ['cell', '4 / 5']],
      [['cell', 'Invoice Service'], ['cell', '3 / 5']],
    ]);
    const tracks = ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('gaia-table-cells')).map((cells) => cells.props['style']);
    expect(tracks).toEqual([{ gridTemplateColumns: COLUMN_WIDTHS }, { gridTemplateColumns: COLUMN_WIDTHS }, { gridTemplateColumns: COLUMN_WIDTHS }]);
  });

  test('only the selected row is marked and current', () => {
    const [head, selected, other] = ReactElementTree.hostElementsIn(tableOf(), ReactElementTree.withClass('gaia-table-row'));
    expect([head?.props['data-head'], selected?.props['data-selected'], selected?.props['aria-current'], other?.props['data-selected'], other?.props['aria-current']])
      .toEqual(['', '', 'true', undefined, undefined]);
  });

  test('content under a row spans every column, and a row without it has none', () => {
    const below = ReactElementTree.hostElementsIn(tableOf(), ReactElementTree.withClass('gaia-table-below'));
    expect(below.map((cell) => [cell.props['role'], cell.props['aria-colspan'], ReactElementTree.textOf([cell])]))
      .toEqual([['cell', 2, 'Stop the Overseer of Example Storefront?']]);
  });

  test('an end-aligned column is marked in the head and the rows, and rows are regular unless tall is asked', () => {
    const cellsOfAgents = ReactElementTree.hostElementsIn(tableOf(), (element) => ReactElementTree.hasClass(element, 'gaia-table-cell') && element.props['data-align'] === 'end');
    expect(cellsOfAgents.map((cell) => ReactElementTree.textOf([cell]))).toEqual(['Agents', '4 / 5', '3 / 5']);
    const isBodyRow = (element: HostElement) => ReactElementTree.hasClass(element, 'gaia-table-row') && element.props['data-head'] === undefined;
    const heights = (rowHeight?: 'regular' | 'tall') => ReactElementTree.hostElementsIn(tableOf(rowHeight), isBodyRow).map((row) => row.props['data-height']);
    expect([heights(), heights('tall')]).toEqual([['regular', 'regular'], ['tall', 'tall']]);
  });
});
