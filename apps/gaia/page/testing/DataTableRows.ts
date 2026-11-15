/**
 * Test-only: reads the rows Gaia hands the design-system contributions' data table, kept folded. Each row stands as an element of its own,
 * `DataTableRow`, with the flags Gaia gave it as its props and, as its children, a `DataTableCell` per column in the table's order and a
 * `DataTableBelow` for what it holds under its cells, each holding that content unfolded; none of it is markup the table draws.
 */
import { DataTable }      from 'design-system-contributions/DataTable';
import type { ReactNode } from 'react';

import { type HostElement, ReactElementTree, type RenderedNode } from './ReactElementTree.ts';

interface RowAsHanded {
  readonly key:          unknown;
  readonly selected?:    unknown;
  readonly interactive?: unknown;
  readonly expanded?:    unknown;
  readonly cells:        Readonly<Record<string, ReactNode>>;
  readonly below?:       ReactNode;
}

function rowElementOf(row: RowAsHanded, columnKeys: readonly string[]): HostElement {
  const cells = columnKeys.map((columnKey): HostElement => ({
    tag:      'DataTableCell',
    props:    { column: columnKey },
    children: ReactElementTree.unfolded(Object.hasOwn(row.cells, columnKey) ? row.cells[columnKey] : null),
  }));
  const below: HostElement[] = row.below === undefined ? [] : [{ tag: 'DataTableBelow', props: {}, children: ReactElementTree.unfolded(row.below) }];
  return {
    tag:   'DataTableRow',
    props: {
      key: row.key, selected: row.selected, interactive: row.interactive, expanded: row.expanded
    },
    children: [...cells, ...below]
  };
}

export const DataTableRows = {
  /** The rows of every data table in the nodes, in order; none where no table is drawn. */
  rowsIn(nodes: readonly RenderedNode[]): HostElement[] {
    return ReactElementTree.hostElementsIn(nodes, ReactElementTree.withComponent(DataTable)).flatMap((table) => {
      const columnKeys = (table.props['columns'] as readonly { readonly key: string }[]).map((column) => column.key);
      return (table.props['rows'] as readonly RowAsHanded[]).map((row) => rowElementOf(row, columnKeys));
    });
  },

  /** A row's cells, in the order of the table's columns. */
  cellsOf(row: HostElement): HostElement[] {
    return row.children.filter((child): child is HostElement => typeof child !== 'string' && child.tag === 'DataTableCell');
  },

  /** The text a reader sees in each cell of a row. */
  cellTextsOf(row: HostElement): string[] {
    return DataTableRows.cellsOf(row).map((cell) => ReactElementTree.textOf([cell]));
  },
} as const;
