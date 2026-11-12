/**
 * Facts as a two-column definition list at 12 px: a muted label and its value, in mono unless the fact says its value is words.
 * `labels-first` gives the labels a column of their own width; `values-end` sets each value at the line's end.
 */
import type { ReactNode } from 'react';

export interface Fact {
  readonly label:      string;
  readonly value:      ReactNode;
  readonly valueFace?: 'mono' | 'ui';
}

export interface FactListProps {
  readonly facts:   readonly Fact[];
  readonly layout?: 'labels-first' | 'values-end';
}

export function FactList({ facts, layout = 'labels-first' }: FactListProps) {
  return (
    <dl className="gaia-facts" data-layout={layout}>
      {facts.map((fact) => (
        <div key={fact.label} className="gaia-fact">
          <dt>{fact.label}</dt>
          <dd data-face={fact.valueFace ?? 'mono'}>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
