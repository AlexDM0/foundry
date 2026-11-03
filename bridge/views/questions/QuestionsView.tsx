/**
 * The Questions view: every open decision, the answered ones below, and the open notices, which have no answer. Notifications are allowed
 * from a click here, never asked for on load.
 */
import { useState } from 'react';

import type { ConversationBoardDocument }               from '../../@types/ConversationDocuments.ts';
import { DecisionCard }                                 from '../../conversation/DecisionCard.tsx';
import type { NotificationAllowance, QuestionNotifier } from './QuestionAlerts.ts';
import { QuestionsModelUtil, type AnsweredDecision }    from './QuestionsModel.ts';

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

function AnsweredDecisionItem({ answered }: { readonly answered: AnsweredDecision }) {
  return (
    <li className="bridge-card" data-state="answered" aria-label={`Answered ${answered.decisionId}`}>
      <h3 className="bridge-card-title">{answered.decisionId}</h3>
      <p className="bridge-card-meta">{`Answered ${answered.answeredAt}`}</p>
      {answered.answer.map(([question, answer]) => <p key={question} className="bridge-note">{`${question} ${answer}`}</p>)}
    </li>
  );
}

export function QuestionsView({ board, notifier }: QuestionsViewProps) {
  const model = QuestionsModelUtil.questionsModelOf(board);
  return (
    <div className="bridge-view">
      <section className="bridge-section" aria-label="Open questions">
        <h2 className="bridge-section-title">{`Open questions (${model.openQuestionCount})`}</h2>
        <NotificationAllowanceControl notifier={notifier} />
        {model.openDecisions.length === 0 ? <p className="bridge-empty">No question waits on User.</p> : null}
        <ul className="bridge-list">
          {model.openDecisions.map(({ decision, escalated }) => <DecisionCard key={decision.id} decision={decision} escalated={escalated} />)}
        </ul>
      </section>
      <section className="bridge-section" aria-label="Answered questions">
        <h2 className="bridge-section-title">Answered</h2>
        <ul className="bridge-list">
          {model.answeredDecisions.map((answered) => <AnsweredDecisionItem key={`${answered.decisionId}-${answered.answeredAt}`} answered={answered} />)}
        </ul>
      </section>
      <section className="bridge-section" aria-label="Notices">
        <h2 className="bridge-section-title">Notices</h2>
        <ul className="bridge-list">
          {model.notices.map((notice, position) => <li key={`${notice.kind}-${position}`} className="bridge-card" data-state="notice">{notice.kind}</li>)}
        </ul>
      </section>
    </div>
  );
}
