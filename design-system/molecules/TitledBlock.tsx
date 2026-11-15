/**
 * A block under its small-capitals title, named by it; the `label` look sets the title as a small bold muted label instead. Its rule sets
 * the line that parts it from its neighbours: `above` draws a line over every block, `between` only between two blocks in a row, `none` no
 * line. The title's element is the screen's choice, an `h3` by default.
 */
import type { ReactNode } from 'react';

import { Text, type TextElement } from '../atoms/Text.tsx';

export type TitledBlockLook = 'small-capitals' | 'label';

export interface TitledBlockProps {
  readonly title:         string;
  /** The title's heading level, chosen by the screen; an `h3` by default. */
  readonly titleElement?: TextElement;
  readonly rule?:         'above' | 'between' | 'none';
  readonly look?:         TitledBlockLook;
  readonly children:      ReactNode;
}

export function TitledBlock({
  title, titleElement = 'h3', rule = 'none', look = 'small-capitals', children
}: TitledBlockProps) {
  return (
    <section className="design-system-block" data-rule={rule} aria-label={title}>
      {look === 'label'
        ? <Text typeRole="small" bold muted element={titleElement} marginBottom="eight">{title}</Text>
        : <Text typeRole="micro" element={titleElement} marginBottom="eight">{title}</Text>}
      {children}
    </section>
  );
}
