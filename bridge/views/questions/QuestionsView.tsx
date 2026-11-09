/**
 * The Questions view: every open decision, the answered ones below, and the open notices, which have no answer. Notifications are allowed
 * from a click here, never asked for on load.
 */
import { useState } from 'react';

import type { ConversationBoardDocument } from '../../@types/ConversationDocuments.ts';
import {
  CardHead,
  MetaLine,
  SectionHead,
  type CardPill
} from '../../conversation/ConversationParts.tsx';
import { DecisionCard }                                                from '../../conversation/DecisionCard.tsx';
import type { NotificationAllowance, QuestionNotifier }                from './QuestionAlerts.ts';
import { QuestionsModelUtil, type AnsweredDecision, type NoticeEntry } from './QuestionsModel.ts';

export interface QuestionsViewProps {
  readonly board:    ConversationBoardDocument;
  readonly notifier: QuestionNotifier;
}

function NotificationAllowanceControl({ notifier }: { readonly notifier: QuestionNotifier }) {
  const [allowance, setAllowance] = useState<NotificationAllowance>(() => notifier.allowance());
  if (allowance !== 'default') return null;
  return (
    <button type="button" className="bridge-button" onClick={() => void notifier.askAllowance().then(setAllowance)}>
      Notify me of new questions
    </button>
  );
}

const ANSWERED_PILL: CardPill = { state: 'reviewed', label: 'answered' };

function AnsweredDecisionItem({ answered }: { readonly answered: AnsweredDecision }) {
  return (
    <li className="bridge-card" data-state="answered" aria-label={`Answered ${answered.decisionId}`}>
      <CardHead id={answered.decisionId} pill={ANSWERED_PILL} />
      <MetaLine parts={[<time className="bridge-card-stamp">{answered.answeredAt}</time>]} />
      {answered.answer.map(([question, answer]) => <p key={question} className="bridge-note">{`${question} ${answer}`}</p>)}
    </li>
  );
}

function NoticeItem({ notice }: { readonly notice: NoticeEntry }) {
  return (
    <li className="bridge-card" data-state="notice">
      <div className="bridge-card-head">
        {notice.subjectText === null ? null : <span className="bridge-ticket-id">{notice.subjectText}</span>}
        <span className="bridge-notice-kind">{notice.kind}</span>
      </div>
      <p className="bridge-note">{notice.sentence}</p>
    </li>
  );
}

export function QuestionsView({ board, notifier }: QuestionsViewProps) {
  const model = QuestionsModelUtil.questionsModelOf(board);
  return (
    <div className="bridge-view">
      <section className="bridge-section" aria-label="Open questions">
        <SectionHead title="Open questions" count={model.openQuestionCount}>
          <NotificationAllowanceControl notifier={notifier} />
        </SectionHead>
        {model.openDecisions.length === 0
          ? <p className="bridge-empty">No question waits on User.</p>
          : (
            <ul className="bridge-list">
              {model.openDecisions.map(({ decision, escalated }) => <DecisionCard key={decision.id} decision={decision} escalated={escalated} />)}
            </ul>
          )}
      </section>
      <section className="bridge-section" aria-label="Answered questions">
        <SectionHead title="Answered" />
        {model.answeredDecisions.length === 0
          ? <p className="bridge-empty">No answered question yet.</p>
          : (
            <ul className="bridge-list">
              {model.answeredDecisions.map((answered) => <AnsweredDecisionItem key={`${answered.decisionId}-${answered.answeredAt}`} answered={answered} />)}
            </ul>
          )}
      </section>
      <section className="bridge-section" aria-label="Notices">
        <SectionHead title="Notices" />
        {model.notices.length === 0
          ? <p className="bridge-empty">No notice.</p>
          : (
            <ul className="bridge-list">
              {model.notices.map((notice, position) => <NoticeItem key={`${notice.kind}-${position}`} notice={notice} />)}
            </ul>
          )}
      </section>
    </div>
  );
}
