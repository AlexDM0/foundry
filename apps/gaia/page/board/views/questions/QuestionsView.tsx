/**
 * The Questions view: every open decision, each of which opens beside the board in the question panel, the answered ones below, and the
 * open notices, which have no answer. Notifications are allowed from a click here, never asked for on load. The view is the questions
 * habitat of Flint (`board/flint/UseQuestionsHabitat.ts`). As a tab of the board it reads the decision the question panel shows from the
 * shell.
 */
import { Button }                      from 'design-system/Button';
import { ListSection }                 from 'design-system/ListSection';
import { MonoId }                      from 'design-system/MonoId';
import { Row }                         from 'design-system/Row';
import { Stamp }                       from 'design-system/Stamp';
import { StateBadge }                  from 'design-system/StateBadge';
import { Text }                        from 'design-system/Text';
import { useContext, useMemo, useRef } from 'react';

import type { BoardDocument }                   from '../../../@types/board/BoardDocument.ts';
import { DecisionCard }                         from '../../conversation/DecisionCard.tsx';
import type { QuestionsFacts }                  from '../../flint/QuestionsSpriteModel.ts';
import { useQuestionsHabitat }                  from '../../flint/UseQuestionsHabitat.ts';
import type { BoardTabViewProps }               from '../../shell/BoardTabViews.tsx';
import { presenceAttributeOf, useItemPresence } from '../../shell/ItemPresence.ts';
import { useQuestionPanelOpener }               from '../../shell/QuestionPanelOpener.ts';
import type { ItemPresence }                    from '../../utils/ItemPresenceUtil.ts';
import { StateToneUtil }                        from '../../utils/StateToneUtil.ts';
import { ViewTitle }                            from '../ViewTitle.tsx';
import { ShownQuestionContext }                 from '../question-panel/QuestionPanelState.ts';
import { NotificationAllowanceControl }         from './NotificationAllowanceControl.tsx';
import type { QuestionNotifier }                from './QuestionAlerts.ts';
import {
  QuestionsModelUtil,
  type AnsweredDecision,
  type NoticeEntry,
  type QuestionsBoard
} from './QuestionsModel.ts';

export interface QuestionsViewProps {
  readonly board:               QuestionsBoard & Pick<BoardDocument, 'incidents'>;
  readonly notifier:            QuestionNotifier;
  /** The decision the question panel shows; absent or `null` while it shows none. */
  readonly selectedDecisionId?: string | null;
}

function AnsweredDecisionItem({ answered, presence }: { readonly answered: AnsweredDecision; readonly presence: ItemPresence }) {
  return (
    <li className="board-card" data-state="answered" data-presence={presenceAttributeOf(presence)} aria-label={`Answered ${answered.decisionId}`}>
      <Row between centerY>
        <Row gap="eight" centerY>
          <MonoId text={answered.decisionId} />
          <StateBadge {...StateToneUtil.lookOf('reviewed')} label="Answered" />
        </Row>
        <Stamp shortText={answered.answeredAt} element="time" />
      </Row>
      {answered.answer.map(([question, answer]) => (
        <Text key={question} element="p" muted>
          {`${question} `}
          <Text bold>{answer}</Text>
        </Text>
      ))}
    </li>
  );
}

function NoticeItem({ notice }: { readonly notice: NoticeEntry }) {
  return (
    <li className="board-card" data-state="notice">
      <Row gap="eight" centerY>
        {notice.subjectText === null ? null : <MonoId text={notice.subjectText} tone="inherited" />}
        <Text typeRole="pill" mono muted>{notice.kind}</Text>
      </Row>
      <Text element="p" muted>{notice.sentence}</Text>
    </li>
  );
}

function answeredKeyOf(answered: AnsweredDecision): string {
  return `${answered.decisionId}-${answered.answeredAt}`;
}

export function QuestionsView({ board, notifier, selectedDecisionId = null }: QuestionsViewProps) {
  const model = QuestionsModelUtil.questionsModelOf(board);
  const openQuestionPanel = useQuestionPanelOpener();
  const viewElement = useRef<HTMLDivElement>(null);
  const questionsFacts = useMemo<QuestionsFacts>(() => ({
    decisions: board.decisions, selectedDecisionId, incidents: board.incidents, history: board.questionHistory,
  }), [board, selectedDecisionId]);
  useQuestionsHabitat(viewElement, questionsFacts);
  // An asked question rises in and an answered one fades out of the open list as its answer rises into the answered one.
  const presentDecisions = useItemPresence(model.openDecisions, ({ decision }) => decision.id);
  const presentAnswers = useItemPresence(model.answeredDecisions, answeredKeyOf);
  return (
    <div className="board-view" ref={viewElement} data-flint-workplace="" data-question-open={selectedDecisionId === null ? undefined : ''}>
      <ViewTitle title="Questions" lead="Agents stop here when they need User's answer." />
      <ListSection
        label="Open questions"
        title="Open questions"
        count={model.openQuestionCount}
        headEnd={<NotificationAllowanceControl notifier={notifier} />}
        emptyText="No question waits on User."
        items={presentDecisions}
        keyOf={({ key }) => key}
        renderItem={({ item: { decision, escalated }, presence }) => (
          <DecisionCard
            decision={decision}
            escalated={escalated}
            presence={presence}
            isOpenBeside={decision.id === selectedDecisionId}
            besideAnswer={<Button label="Open beside the board" onPress={() => openQuestionPanel(decision.id)} />}
          />
        )}
      />
      <ListSection
        label="Answered questions"
        title="Answered"
        emptyText="No answered question yet."
        items={presentAnswers}
        keyOf={({ key }) => key}
        renderItem={({ item, presence }) => <AnsweredDecisionItem answered={item} presence={presence} />}
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

/** The Questions tab of the board: the view over the shown board, beside the decision the shell's question panel shows. */
export function QuestionsTabView({ board, services }: BoardTabViewProps) {
  const shownDecisionId = useContext(ShownQuestionContext);
  return <QuestionsView board={board} notifier={services.questionNotifier} selectedDecisionId={shownDecisionId} />;
}
