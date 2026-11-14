/**
 * A surface card with a head bar: a small-capitals title with an optional mono mark after it, a subtitle, a count apart at the head's end
 * and whatever the caller adds there; then its body, padded or filled edge to edge by a table, a chat or a list; then an optional foot. The
 * title's element is the screen's choice, an `h2` by default.
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
        <Text typeRole="title" element={titleElement}>
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
        {subtitle === undefined ? null : <span className="design-system-pane-subtitle">{subtitle}</span>}
        {countText === undefined ? null : <span className="design-system-pane-count">{countText}</span>}
        {headEnd === undefined ? null : <div className="design-system-pane-head-end">{headEnd}</div>}
      </div>
      <div className="design-system-pane-body" data-body={body}>{children}</div>
      {foot === undefined ? null : <div className="design-system-pane-foot">{foot}</div>}
    </>
  );
  if (element === 'aside') return <aside className="design-system-pane" aria-label={label}>{content}</aside>;
  return <section className="design-system-pane" aria-label={label}>{content}</section>;
}
