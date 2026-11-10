/**
 * One thing that waits on User, as a line: its kind in small capitals, its mono id and the tickets it is about, the question, the meta
 * line, its age and its action. A row is an entry of its caller's list (an inbox); a strip sits under the job it blocks.
 */
import type { ReactNode } from 'react';

import type { DisplayState } from '../../src/lib/tracker-model/@types/Task.ts';
import { MicroCapsLabel }    from '../design-system/MicroCapsLabel.tsx';
import { MonoId }            from '../design-system/MonoId.tsx';
import { Stamp }             from '../design-system/Stamp.tsx';
import { MetaLine }          from './ConversationParts.tsx';

export interface AskKind {
  readonly text:   string;
  readonly tone:   'state' | 'error' | 'muted';
  /** The state whose ink a `state` kind takes, and whose edge a strip takes. */
  readonly state?: DisplayState;
}

export interface AskAge {
  readonly shortText: string;
  readonly fullText:  string;
}

export interface AskItemProps {
  readonly layout:       'strip' | 'row';
  readonly kind:         AskKind;
  readonly decisionId:   string;
  /** The tickets it is about, as links. */
  readonly subject?:     ReactNode;
  readonly questionText: string;
  readonly meta:         readonly ReactNode[];
  /** `null` when nothing stamped it: no time is invented. */
  readonly age:          AskAge | null;
  readonly action:       ReactNode;
  readonly escalated:    boolean;
}

export function AskItem({
  layout, kind, decisionId, subject, questionText, meta, age, action, escalated
}: AskItemProps) {
  const content = (
    <>
      <div className="bridge-ask-line">
        <MicroCapsLabel text={kind.text} tone={kind.tone} />
        <MonoId text={decisionId} />
        {subject === undefined
          ? null
          : (
            <>
              <span aria-hidden="true">·</span>
              {subject}
            </>
          )}
      </div>
      <p className="bridge-ask-text" title={questionText}>{questionText}</p>
      {meta.length === 0 ? null : <MetaLine parts={meta} />}
      <div className="bridge-ask-side">
        {age === null ? null : <Stamp shortText={age.shortText} fullText={age.fullText} />}
        {action}
      </div>
    </>
  );
  const askAttributes = {
    'data-layout':    layout,
    'data-escalated': escalated ? '' : undefined,
    'data-state':     kind.state,
  };
  if (layout === 'row') return <li className="bridge-ask" {...askAttributes}>{content}</li>;
  return <div className="bridge-ask" {...askAttributes}>{content}</div>;
}
