/**
 * One thing that waits on User, as a line: its kind in small capitals (a strip's in small orange words), its mono id and the tickets it
 * is about, the question, the meta line, its age and its action. A row is an entry of its caller's list (an inbox); a strip sits under the job it blocks.
 */

import type { ReactNode } from 'react';

import type { BoardDisplayState } from '../../@types/board/BoardVocabulary.ts';
import {
  MicroCapsLabel,
  MonoId,
  Stamp,
  Text
} from '../../lib/design-system/DesignSystemInterface.ts';
import { StateToneUtil } from '../utils/StateToneUtil.ts';
import { MetaLine }      from './ConversationParts.tsx';

export interface AskKind {
  readonly text:   string;
  readonly tone:   'state' | 'error' | 'muted';
  /** The state whose ink a `state` kind takes, and whose edge a strip takes. */
  readonly state?: BoardDisplayState;
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
      <div className="board-ask-line">
        {layout === 'strip'
          ? <span className="board-ask-strip-kind"><Text typeRole="small" bold>{kind.text}</Text></span>
          : <MicroCapsLabel text={kind.text} tone={kind.tone} />}
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
      <p className="board-ask-text" title={questionText}>{questionText}</p>
      {meta.length === 0 ? null : <MetaLine parts={meta} />}
      <div className="board-ask-side">
        {age === null ? null : <span className="board-ask-age"><Stamp shortText={age.shortText} fullText={age.fullText} /></span>}
        {action}
      </div>
    </>
  );
  const askAttributes = {
    'data-layout':     layout,
    'data-escalated':  escalated ? '' : undefined,
    'data-state':      kind.state,
    'data-state-tone': StateToneUtil.optionalToneOf(kind.state),
  };
  if (layout === 'row') return <li className="board-ask" {...askAttributes}>{content}</li>;
  return <div className="board-ask" {...askAttributes}>{content}</div>;
}
