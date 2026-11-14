/**
 * The Questions view: every open decision, each of which opens beside the board in the question panel, the answered ones below, and the
 * open notices, which have no answer. Notifications are allowed from a click here, never asked for on load. The view is the questions
 * habitat of Flint (`bridge/flint/UseQuestionsHabitat.ts`).
 */
import { useMemo, useRef } from 'react';

import type { ConversationBoardDocument }                              from '../../@types/ConversationDocuments.ts';
import { CardHead, MetaLine, type CardPill }                           from '../../conversation/ConversationParts.tsx';
import { DecisionCard }                                                from '../../conversation/DecisionCard.tsx';
import { Button }                                                      from '../../design-system/Button.tsx';
import { ListSection }                                                 from '../../design-system/ListSection.tsx';
import { MonoId }                                                      from '../../design-system/MonoId.tsx';
import { Stamp }                                                       from '../../design-system/Stamp.tsx';
import type { QuestionsFacts }                                         from '../../flint/QuestionsSpriteModel.ts';
import { useQuestionsHabitat }                                         from '../../flint/UseQuestionsHabitat.ts';
import { useQuestionPanelOpener }                                      from '../../shell/QuestionPanelOpener.ts';
import { NotificationAllowanceControl }                                from './NotificationAllowanceControl.tsx';
import type { QuestionNotifier }                                       from './QuestionAlerts.ts';
import { QuestionsModelUtil, type AnsweredDecision, type NoticeEntry } from './QuestionsModel.ts';

export interface QuestionsViewProps {
  readonly board:               ConversationBoardDocument;
  readonly notifier:            QuestionNotifier;
  /** The decision the question panel shows; absent or `null` while it shows none. */
  readonly selectedDecisionId?: string | null;
}

const ANSWERED_PILL: CardPill = { state: 'reviewed', label: 'answered' };

function AnsweredDecisionItem({ answered }: { readonly answered: AnsweredDecision }) {
  return (
    <li className="bridge-card" data-state="answered" aria-label={`Answered ${answered.decisionId}`}>
      <CardHead id={answered.decisionId} pill={ANSWERED_PILL} />
      <MetaLine parts={[<Stamp shortText={answered.answeredAt} element="time" />]} />
      {answered.answer.map(([question, answer]) => <p key={question} className="bridge-note">{`${question} ${answer}`}</p>)}
    </li>
  );
}

function NoticeItem({ notice }: { readonly notice: NoticeEntry }) {
  return (
    <li className="bridge-card" data-state="notice">
      <div className="bridge-card-head">
        {notice.subjectText === null ? null : <MonoId text={notice.subjectText} />}
        <span className="bridge-notice-kind">{notice.kind}</span>
      </div>
      <p className="bridge-note">{notice.sentence}</p>
    </li>
  );
}

export function QuestionsView({ board, notifier, selectedDecisionId = null }: QuestionsViewProps) {
  const model = QuestionsModelUtil.questionsModelOf(board);
  const openQuestionPanel = useQuestionPanelOpener();
  const viewElement = useRef<HTMLDivElement>(null);
  const questionsFacts = useMemo<QuestionsFacts>(() => ({
    decisions: board.decisions, selectedDecisionId, incidents: board.incidents, history: board.questionHistory ?? [],
  }), [board, selectedDecisionId]);
  useQuestionsHabitat(viewElement, questionsFacts);
  return (
    <div className="bridge-view" ref={viewElement} data-flint-workplace="">
      <ListSection
        label="Open questions"
        title="Open questions"
        count={model.openQuestionCount}
        headEnd={<NotificationAllowanceControl notifier={notifier} />}
        emptyText="No question waits on User."
        items={model.openDecisions}
        keyOf={({ decision }) => decision.id}
        renderItem={({ decision, escalated }) => (
          <DecisionCard
            decision={decision}
            escalated={escalated}
            besideAnswer={<Button label="Open beside the board" onPress={() => openQuestionPanel(decision.id)} />}
          />
        )}
      />
      <ListSection
        label="Answered questions"
        title="Answered"
        emptyText="No answered question yet."
        items={model.answeredDecisions}
        keyOf={(answered) => `${answered.decisionId}-${answered.answeredAt}`}
        renderItem={(answered) => <AnsweredDecisionItem answered={answered} />}
      />
      <ListSection
        label="Notices"
        title="Notices"
        emptyText="No notice."
        items={model.notices}
        keyOf={(notice, position) => `${notice.kind}-${position}`}
        renderItem={(notice) => <NoticeItem notice={notice} />}
      />
    </div>
  );
}
