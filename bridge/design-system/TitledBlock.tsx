/**
 * A block under its small-capitals title, named by it. Its rule sets the line that parts it from its neighbours: `above` draws a line over
 * every block, `between` only between two blocks in a row, `none` no line.
 */
import type { ReactNode } from 'react';

export interface TitledBlockProps {
  readonly title:    string;
  readonly rule?:    'above' | 'between' | 'none';
  readonly children: ReactNode;
}

export function TitledBlock({ title, rule = 'none', children }: TitledBlockProps) {
  return (
    <section className="bridge-block" data-rule={rule} aria-label={title}>
      <h3 className="bridge-block-title">{title}</h3>
      {children}
    </section>
  );
}
