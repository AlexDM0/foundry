/**
 * A surface card with a head bar: a small-capitals title with an optional mono mark after it, a subtitle, a count apart at the head's end
 * and whatever the caller adds there; then its body, padded or filled edge to edge by a table, a chat or a list; then an optional foot.
 */
import type { ReactNode } from 'react';

export interface PaneProps {
  /** The card's accessible name. */
  readonly label:      string;
  readonly title:      string;
  /** A mono id after the title, such as the job a card shows. */
  readonly titleMark?: string;
  readonly subtitle?:  string;
  readonly countText?: string;
  readonly headEnd?:   ReactNode;
  readonly foot?:      ReactNode;
  readonly body:       'padded' | 'flush';
  readonly element?:   'section' | 'aside';
  readonly children:   ReactNode;
}

export function Pane({
  label, title, titleMark, subtitle, countText, headEnd, foot, body, element = 'section', children
}: PaneProps) {
  const content = (
    <>
      <div className="bridge-pane-head">
        <h2 className="bridge-pane-title">
          {title}
          {titleMark === undefined
            ? null
            : (
              <>
                {' '}
                <span className="bridge-pane-mark">{titleMark}</span>
              </>
            )}
        </h2>
        {subtitle === undefined ? null : <span className="bridge-pane-subtitle">{subtitle}</span>}
        {countText === undefined ? null : <span className="bridge-pane-count">{countText}</span>}
        {headEnd === undefined ? null : <div className="bridge-pane-head-end">{headEnd}</div>}
      </div>
      <div className="bridge-pane-body" data-body={body}>{children}</div>
      {foot === undefined ? null : <div className="bridge-pane-foot">{foot}</div>}
    </>
  );
  if (element === 'aside') return <aside className="bridge-pane" aria-label={label}>{content}</aside>;
  return <section className="bridge-pane" aria-label={label}>{content}</section>;
}
