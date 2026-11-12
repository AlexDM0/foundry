/**
 * One change to a pipeline: a coloured edge for its kind, its title and where it is, the value before (struck in a card) and after, a
 * note, and the caller's actions such as Undo. The caller words the change in `location`, so it never reads by colour alone. A card stands
 * apart in a list of changes; a row is the denser form of a summary.
 */
import type { ReactNode } from 'react';

export type ChangeRowChange = 'changed' | 'new' | 'removed';

export interface ChangeRowProps {
  readonly change:   ChangeRowChange;
  readonly title:    string;
  readonly location: string;
  readonly before?:  string;
  readonly after?:   string;
  readonly note?:    string;
  readonly actions?: ReactNode;
  readonly density:  'card' | 'row';
}

export function ChangeRow({
  change, title, location, before, after, note, actions, density
}: ChangeRowProps) {
  const hasValues = before !== undefined || after !== undefined;
  return (
    <div className="bridge-change-row" data-change={change} data-density={density}>
      <span className="bridge-change-row-edge" aria-hidden="true" />
      <div className="bridge-change-row-head">
        <span>
          <span className="bridge-change-row-title">{title}</span>
          {' '}
          <span className="bridge-change-row-location">{location}</span>
        </span>
        {actions === undefined ? null : <span className="bridge-change-row-actions">{actions}</span>}
      </div>
      {hasValues
        ? (
          <div className="bridge-change-row-values">
            {before === undefined ? null : <span className="bridge-change-row-before">{before}</span>}
            {after === undefined ? null : <span className="bridge-change-row-after">{after}</span>}
          </div>
        )
        : null}
      {note === undefined ? null : <p className="bridge-change-row-note">{note}</p>}
    </div>
  );
}
