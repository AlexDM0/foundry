/**
 * Facts as a description list, each a label and its value with an optional second line under the value. `inline` runs them as one
 * wrapping line of label-value pairs; `grid` sets them in two columns, each label over its value; `table` gives each a row, its label in a
 * narrow column.
 */
import type { ReactNode } from 'react';

export interface Fact {
  readonly label: string;
  readonly value: ReactNode;
  readonly sub?:  ReactNode;
}

export interface FactListProps {
  readonly facts:  readonly Fact[];
  readonly layout: 'inline' | 'grid' | 'table';
}

export function FactList({ facts, layout }: FactListProps) {
  if (facts.length === 0) return null;
  return (
    <dl className="bridge-facts" data-layout={layout}>
      {facts.map((fact) => (
        <div key={fact.label} className="bridge-fact">
          <dt>{fact.label}</dt>
          <dd>
            {fact.value}
            {fact.sub === undefined ? null : <span className="bridge-fact-sub">{fact.sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
