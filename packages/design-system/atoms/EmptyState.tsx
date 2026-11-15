/**
 * What a place shows while it holds nothing: a short text in its own words, and an optional action after it. A compact one sits in the body
 * of a card, which pads its sides.
 */
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  readonly text:      string;
  /** An action after the text, such as a link to where the work is. */
  readonly children?: ReactNode;
  readonly compact?:  boolean;
}

export function EmptyState({ text, children, compact = false }: EmptyStateProps) {
  return (
    <p className="design-system-empty" data-compact={compact ? '' : undefined}>
      {text}
      {children}
    </p>
  );
}
