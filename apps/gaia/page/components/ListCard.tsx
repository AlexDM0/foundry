/** Rows inside one bordered card, a hairline between each: the attention list, the forges that need a look. */
import type { ReactNode } from 'react';

export interface ListCardRow {
  readonly key:     string;
  readonly content: ReactNode;
}

export interface ListCardProps {
  readonly label: string;
  readonly rows:  readonly ListCardRow[];
}

export function ListCard({ label, rows }: ListCardProps) {
  return (
    <ul className="gaia-list-card" aria-label={label}>
      {rows.map((row) => <li key={row.key} className="gaia-list-card-row">{row.content}</li>)}
    </ul>
  );
}
