/**
 * A table drawn as one CSS grid per row inside a bordered card: a micro-caps head row, then rows of 40 px, or 64 px for the tall variant.
 * A row may be the selected one, and may carry content under its cells, such as a confirm panel or a refusal, spanning every column.
 */
import type { ReactNode } from 'react';

export interface DataTableColumn<Key extends string> {
  readonly key:    Key;
  readonly label:  string;
  readonly align?: 'start' | 'end';
}

export interface DataTableRow<Key extends string> {
  readonly key:       string;
  readonly cells:     Readonly<Record<Key, ReactNode>>;
  readonly selected?: boolean;
  readonly below?:    ReactNode;
}

export interface DataTableProps<Key extends string> {
  readonly label:        string;
  readonly columns:      readonly DataTableColumn<Key>[];
  /** The value of `grid-template-columns`, one track per column. */
  readonly columnWidths: string;
  readonly rows:         readonly DataTableRow<Key>[];
  readonly rowHeight?:   'regular' | 'tall';
}

export function DataTable<Key extends string>({
  label, columns, columnWidths, rows, rowHeight = 'regular'
}: DataTableProps<Key>) {
  const gridStyle = { gridTemplateColumns: columnWidths };
  return (
    <div className="gaia-table" role="table" aria-label={label}>
      <div className="gaia-table-row" role="row" data-head="">
        <div className="gaia-table-cells" role="none" style={gridStyle}>
          {columns.map((column) => <span key={column.key} className="gaia-table-cell" role="columnheader" data-align={column.align ?? 'start'}>{column.label}</span>)}
        </div>
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="gaia-table-row"
          role="row"
          data-height={rowHeight}
          data-selected={row.selected === true ? '' : undefined}
          aria-current={row.selected === true ? 'true' : undefined}
        >
          <div className="gaia-table-cells" role="none" style={gridStyle}>
            {columns.map((column) => <span key={column.key} className="gaia-table-cell" role="cell" data-align={column.align ?? 'start'}>{row.cells[column.key]}</span>)}
          </div>
          {row.below === undefined ? null : <div className="gaia-table-below" role="cell" aria-colspan={columns.length}>{row.below}</div>}
        </div>
      ))}
    </div>
  );
}
