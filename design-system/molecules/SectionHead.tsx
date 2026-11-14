/**
 * The head of a section: a small-capitals title, an optional count apart at its end, then whatever the caller adds. The title's element is
 * the screen's choice, an `h2` by default. An inline head reads as one line of text: its parts on one baseline, the count right after
 * the title.
 */
import type { ReactNode } from 'react';

import { Text, type TextElement } from '../atoms/Text.tsx';

export interface SectionHeadProps {
  readonly title:         string;
  /** The title's heading level, chosen by the screen; an `h2` by default. */
  readonly titleElement?: TextElement;
  /** Shown apart, muted at the head's end; left out where a section counts nothing. */
  readonly count?:        number;
  readonly inline?:       boolean;
  readonly children?:     ReactNode;
}

export function SectionHead({
  title, titleElement = 'h2', count, inline = false, children
}: SectionHeadProps) {
  return (
    <div className="design-system-section-head" data-inline={inline ? '' : undefined}>
      <Text typeRole="micro" element={titleElement}>{title}</Text>
      {count === undefined ? null : <span className="design-system-section-count">{count}</span>}
      {children}
    </div>
  );
}
