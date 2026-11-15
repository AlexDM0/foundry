/**
 * A surface card with a head bar: the title in the page face with an optional mono mark after it and the count in a quiet pill beside it,
 * a subtitle on the line under them, and whatever the caller adds at the head's end; then its body, padded or filled edge to edge by a
 * table, a chat or a list; then an optional foot. The title's element is the screen's choice, an `h2` by default.
 */
import type { ReactNode } from 'react';

import { Text, type TextElement } from '../atoms/Text.tsx';

export interface PaneProps {
  /** The card's accessible name. */
  readonly label:         string;
  readonly title:         string;
  /** The title's heading level, chosen by the screen; an `h2` by default. */
  readonly titleElement?: TextElement;
  /** A mono id after the title, such as the id of the item a card shows. */
  readonly titleMark?:    string;
  readonly subtitle?:     string;
  readonly countText?:    string;
  readonly headEnd?:      ReactNode;
  readonly foot?:         ReactNode;
  readonly body:          'padded' | 'flush';
  readonly element?:      'section' | 'aside';
  readonly children:      ReactNode;
}

export function Pane({
  label, title, titleElement = 'h2', titleMark, subtitle, countText, headEnd, foot, body, element = 'section', children
}: PaneProps) {
  const content = (
    <>
      <div className="design-system-pane-head">
        <div className="design-system-pane-heading">
          <div className="design-system-pane-title-line">
            <Text typeRole="page" element={titleElement}>
              {title}
              {titleMark === undefined
                ? null
                : (
                  <>
                    {' '}
                    <span className="design-system-pane-mark">{titleMark}</span>
                  </>
                )}
            </Text>
            {countText === undefined ? null : <span className="design-system-pane-count">{countText}</span>}
          </div>
          {subtitle === undefined ? null : <span className="design-system-pane-subtitle">{subtitle}</span>}
        </div>
        {headEnd === undefined ? null : <div className="design-system-pane-head-end">{headEnd}</div>}
      </div>
      <div className="design-system-pane-body" data-body={body}>{children}</div>
      {foot === undefined ? null : <div className="design-system-pane-foot">{foot}</div>}
    </>
  );
  if (element === 'aside') return <aside className="design-system-pane" aria-label={label}>{content}</aside>;
  return <section className="design-system-pane" aria-label={label}>{content}</section>;
}
