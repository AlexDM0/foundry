/**
 * The Questions view: every open decision, each of which opens beside the board in the question panel, the answered ones below, and the
 * open notices, which have no answer. Notifications are allowed from a click here, never asked for on load.
 */
import { Button }      from 'design-system/Button';
import { ListSection } from 'design-system/ListSection';
import { MonoId }      from 'design-system/MonoId';
import { Row }         from 'design-system/Row';
import { Stamp }       from 'design-system/Stamp';
import { StateBadge }  from 'design-system/StateBadge';
import { Text }        from 'design-system/Text';

import type { ConversationBoardDocument }                              from '../../@types/ConversationDocuments.ts';
import { DecisionCard }                                                from '../../conversation/DecisionCard.tsx';
import { useQuestionPanelOpener }                                      from '../../shell/QuestionPanelOpener.ts';
import { StateToneUtil }                                               from '../../utils/StateToneUtil.ts';
import { ViewTitle }                                                   from '../ViewTitle.tsx';
import { NotificationAllowanceControl }                                from './NotificationAllowanceControl.tsx';
import type { QuestionNotifier }                                       from './QuestionAlerts.ts';
import { QuestionsModelUtil, type AnsweredDecision, type NoticeEntry } from './QuestionsModel.ts';

export interface QuestionsViewProps {
  readonly board:    ConversationBoardDocument;
  readonly notifier: QuestionNotifier;
}

function AnsweredDecisionItem({ answered }: { readonly answered: AnsweredDecision }) {
  return (
    <li className="bridge-card" data-state="answered" aria-label={`Answered ${answered.decisionId}`}>
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
    <li className="bridge-card" data-state="notice">
      <Row gap="eight" centerY>
        {notice.subjectText === null ? null : <MonoId text={notice.subjectText} tone="inherited" />}
        <Text typeRole="pill" mono muted>{notice.kind}</Text>
      </Row>
      <Text element="p" muted>{notice.sentence}</Text>
    </li>
  );
}

export function QuestionsView({ board, notifier }: QuestionsViewProps) {
  const model = QuestionsModelUtil.questionsModelOf(board);
  const openQuestionPanel = useQuestionPanelOpener();
  return (
    <div className="bridge-view">
      <ViewTitle title="Questions" lead="Agents stop here when they need User's answer." />
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
