/**
 * The head of a section: a small-capitals title, an optional count apart at its end, then whatever the caller adds. The title's element is
 * the screen's choice, an `h2` by default. An inline head reads as one line of text: its parts on one baseline, the count right after
 * the title. The `heading` look sets the title in the title size, its count in a quiet pill right after it, and what the caller adds at
 * the head's end. A compact head is only as tall as its parts.
 */
import type { ReactNode } from 'react';

import { Text, type TextElement } from '../atoms/Text.tsx';

export type SectionHeadLook = 'small-capitals' | 'heading';

export interface SectionHeadProps {
  readonly title:         string;
  /** The title's heading level, chosen by the screen; an `h2` by default. */
  readonly titleElement?: TextElement;
  /** The title's id, so a region elsewhere can be labelled by it. */
  readonly titleId?:      string;
  /** Shown apart, muted at the head's end, a number or a count written as text such as "1.24M" or "4+"; left out where a section counts nothing. */
  readonly count?:        number | string;
  readonly inline?:       boolean;
  /** Drops the head's minimum height, for a head that sits on a dense line. */
  readonly compact?:      boolean;
  readonly look?:         SectionHeadLook;
  readonly children?:     ReactNode;
}

export function SectionHead({
  title, titleElement = 'h2', titleId, count, inline = false, compact = false, look = 'small-capitals', children
}: SectionHeadProps) {
  const isHeading = look === 'heading';
  return (
    <div className="design-system-section-head" data-inline={inline ? '' : undefined} data-compact={compact ? '' : undefined} data-look={look}>
      <Text typeRole={isHeading ? 'title' : 'micro'} element={titleElement} {...(titleId === undefined ? {} : { id: titleId })}>{title}</Text>
      {count === undefined ? null : <span className="design-system-section-count">{count}</span>}
      {isHeading && children !== undefined && children !== null ? <span className="design-system-section-head-end">{children}</span> : children}
    </div>
  );
}
