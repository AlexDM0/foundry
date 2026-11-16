/**
 * Facts as a description list, each a label and its value with an optional second line under the value. `inline` runs them as one
 * wrapping line of label-value pairs; `grid` sets them in two columns, each label over its value; `table` gives each a row, its label in a
 * narrow column, or with `fittedLabels` in a column as wide as its widest label.
 */
import type { ReactNode } from 'react';

export interface Fact {
  readonly label: string;
  readonly value: ReactNode;
  readonly sub?:  ReactNode;
}

/** Only a table has a label column to fit. */
type FactListLayout =
  | { readonly layout: 'table'; readonly fittedLabels?: boolean }
  | { readonly layout: 'inline' | 'grid'; readonly fittedLabels?: never };

export type FactListProps = FactListLayout & {
  readonly facts: readonly Fact[];
};

export function FactList({ facts, layout, fittedLabels = false }: FactListProps) {
  if (facts.length === 0) return null;
  return (
    <dl className="design-system-facts" data-layout={layout} data-fitted-labels={fittedLabels ? '' : undefined}>
      {facts.map((fact) => (
        <div key={fact.label} className="design-system-fact">
          <dt>{fact.label}</dt>
          <dd>
            {fact.value}
            {fact.sub === undefined ? null : <span className="design-system-fact-sub">{fact.sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
