/**
 * A table drawn as one CSS grid per row inside a bordered card: a micro-caps head row, then rows of 40px, 36px compact or 58px tall. A row may be
 * selected, interactive, expanded onto the wash (never the selection's orange) or carry content spanning every column, such as a confirmation. A
 * head label may be screen-reader only, and columns may sit closer or further in.
 */
import type { ReactNode } from 'react';

export interface DataTableColumn<Key extends string> {
  readonly key:          Key;
  readonly label:        string;
  readonly align?:       'start' | 'end';
  readonly labelHidden?: boolean;
}

export interface DataTableRow<Key extends string> {
  readonly key:          string;
  readonly cells:        Readonly<Record<Key, ReactNode>>;
  readonly selected?:    boolean;
  readonly interactive?: boolean;
  readonly expanded?:    boolean;
  readonly below?:       ReactNode;
}

export interface DataTableProps<Key extends string> {
  readonly label:        string;
  readonly columns:      readonly DataTableColumn<Key>[];
  /** The tracks of `grid-template-columns`, one per column, such as `120px minmax(0, 1fr)`. */
  readonly columnWidths: string;
  readonly rows:         readonly DataTableRow<Key>[];
  readonly rowHeight?:   'compact' | 'regular' | 'tall';
  readonly columnGap?:   'regular' | 'narrow';
  readonly inset?:       'regular' | 'wide';
}

const flagAttribute = (isSet: boolean | undefined) => (isSet === true ? '' : undefined);

export function DataTable<Key extends string>({
  label, columns, columnWidths, rows, rowHeight = 'regular', columnGap = 'regular', inset = 'regular'
}: DataTableProps<Key>) {
  const gridStyle = { gridTemplateColumns: columnWidths };
  return (
    <div
      className="design-system-data-table"
      role="table"
      aria-label={label}
      data-row-height={rowHeight}
      data-column-gap={columnGap === 'regular' ? undefined : columnGap}
      data-inset={inset === 'regular' ? undefined : inset}
    >
      <div className="design-system-data-table-row" role="row" data-head="">
        <div className="design-system-data-table-cells" role="none" style={gridStyle}>
          {columns.map((column) => (
            <span
              key={column.key}
              className="design-system-data-table-cell"
              role="columnheader"
              data-align={column.align ?? 'start'}
              data-hidden={flagAttribute(column.labelHidden)}
            >
              {column.label}
            </span>
          ))}
        </div>
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="design-system-data-table-row"
          role="row"
          data-selected={flagAttribute(row.selected)}
          data-interactive={flagAttribute(row.interactive)}
          data-expanded={flagAttribute(row.expanded)}
          data-state-tone={row.expanded === true ? 'muted' : undefined}
          aria-current={row.selected === true ? 'true' : undefined}
        >
          <div className="design-system-data-table-cells" role="none" style={gridStyle}>
            {columns.map((column) => (
              <span key={column.key} className="design-system-data-table-cell" role="cell" data-align={column.align ?? 'start'}>{row.cells[column.key]}</span>
            ))}
          </div>
          {row.below === undefined ? null : <div className="design-system-data-table-below" role="cell" aria-colspan={columns.length}>{row.below}</div>}
        </div>
      ))}
    </div>
  );
}
