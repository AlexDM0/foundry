/**
 * A page's head: its title in the display role, its lead under it in the lead role, and at the line's end its figures, each with its
 * hairline, then its actions. The title is the page's `h1` unless the screen nests the head under another heading.
 */
import type { StateTone }         from 'design-system/StateTone';
import { Text, type TextElement } from 'design-system/Text';
import type { ReactNode }         from 'react';

import { Figure } from '../atoms/Figure.tsx';

export interface PageHeadFigure {
  readonly value: string;
  readonly label: string;
  readonly tone?: StateTone;
}

export interface PageHeadProps {
  readonly title:         string;
  /** The one sentence under the title; it may hold markup, such as a count read out as it changes. */
  readonly lead:          ReactNode;
  readonly titleElement?: TextElement;
  readonly figures?:      readonly PageHeadFigure[];
  readonly actions?:      ReactNode;
}

export function PageHead({
  title, lead, titleElement = 'h1', figures = [], actions
}: PageHeadProps) {
  return (
    <header className="design-system-page-head">
      <div className="design-system-page-head-words">
        <Text typeRole="display" element={titleElement}>{title}</Text>
        <Text typeRole="lead" element="p" muted>{lead}</Text>
      </div>
      {figures.length === 0 ? null : (
        <div className="design-system-page-head-figures">
          {figures.map((figure) => (
            <Figure key={figure.label} value={figure.value} label={figure.label} {...(figure.tone === undefined ? {} : { tone: figure.tone })} />
          ))}
        </div>
      )}
      {actions === undefined ? null : <div className="design-system-page-head-actions">{actions}</div>}
    </header>
  );
}
