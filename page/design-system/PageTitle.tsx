/**
 * A view's title (COMPONENT_LIBRARY 3.4): the page's one heading in the package's display role (Newsreader 34/40), its lead under it in
 * the lead role, and at the line's end the view's figures, each with its hairline, then its actions. B3 folds the figures onto one line.
 */
import { Text }           from 'design-system/Text';
import type { ReactNode } from 'react';


import { Figure, type FigureForm } from './Figure.tsx';

export interface PageFigure {
  readonly value:      string;
  readonly label:      string;
  /** The value waits on User or stands at a limit. */
  readonly attention?: boolean;
}

export interface PageTitleProps {
  readonly title:        string;
  readonly lead:         string;
  readonly figures?:     readonly PageFigure[];
  readonly figuresForm?: FigureForm;
  readonly actions?:     ReactNode;
}

export function PageTitle({
  title, lead, figures = [], figuresForm = 'stacked', actions
}: PageTitleProps) {
  return (
    <header className="gaia-page-title">
      <div className="gaia-page-title-words">
        <Text typeRole="display" element="h1">{title}</Text>
        <Text typeRole="lead" element="p" muted>{lead}</Text>
      </div>
      {figures.length === 0 ? null : (
        <div className="gaia-page-title-figures" data-form={figuresForm}>
          {figures.map((figure) => (
            <Figure key={figure.label} value={figure.value} label={figure.label} form={figuresForm} attention={figure.attention === true} />
          ))}
        </div>
      )}
      {actions === undefined ? null : <div className="gaia-page-title-actions">{actions}</div>}
    </header>
  );
}
