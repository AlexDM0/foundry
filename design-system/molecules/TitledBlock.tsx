/**
 * A block under its small-capitals title, named by it. Its rule sets the line that parts it from its neighbours: `above` draws a line over
 * every block, `between` only between two blocks in a row, `none` no line. The title's element is the screen's choice, an `h3` by default.
 */
import type { ReactNode } from 'react';

import { Text, type TextElement } from '../atoms/Text.tsx';

export interface TitledBlockProps {
  readonly title:         string;
  /** The title's heading level, chosen by the screen; an `h3` by default. */
  readonly titleElement?: TextElement;
  readonly rule?:         'above' | 'between' | 'none';
  readonly children:      ReactNode;
}

export function TitledBlock({
  title, titleElement = 'h3', rule = 'none', children
}: TitledBlockProps) {
  return (
    <section className="design-system-block" data-rule={rule} aria-label={title}>
      <Text typeRole="micro" element={titleElement} marginBottom="eight">{title}</Text>
      {children}
    </section>
  );
}
