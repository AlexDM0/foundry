/**
 * The Questions view: every open decision, the answered ones and the open notices. Notifications are allowed from a click here, never asked for on
 * load.
 */
import { useContext, useMemo, useRef } from 'react';

import type { BoardDecisionDocument } from '../../../@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument }         from '../../../@types/board/BoardDocument.ts';
import {
  Button,
  type ListItemPresence,
  ListSection,
  MonoId,
  PageHead,
  presenceAttributeOf,
  Row,
  Stamp,
  StateBadge,
  Text,
  useListPresence
} from '../../../lib/design-system/DesignSystemInterface.ts';
import { BoardRouter }                  from '../../../shared/BoardRouter.ts';
import type { BoardTabViewProps }       from '../../@types/BoardTabViewProps.ts';
import type { QuestionNotifier }        from '../../@types/QuestionNotifier.ts';
import { DecisionCard }                 from '../../conversation/DecisionCard.tsx';
import type { QuestionsFacts }          from '../../flint/QuestionsSpriteModel.ts';
import { useQuestionsHabitat }          from '../../flint/UseQuestionsHabitat.ts';
import { useBoardHrefOf }               from '../../shared/routing/BoardRouteLinks.ts';
import { useQuestionPanelOpener }       from '../../shared/routing/QuestionPanelOpener.ts';
import { StateToneUtil }                from '../../utils/StateToneUtil.ts';
import { NotificationAllowanceControl } from './NotificationAllowanceControl.tsx';
import {
  QuestionsModelUtil,
  type AnsweredDecision,
  type NoticeEntry,
  type QuestionsBoard
} from './QuestionsModel.ts';
import { ShownQuestionContext } from './panel/QuestionPanelState.ts';

export interface QuestionsViewProps {
  readonly board:               QuestionsBoard & Pick<BoardDocument, 'incidents'>;
  readonly notifier:            QuestionNotifier;
  /** The decision the question panel shows; absent or `null` while it shows none. */
  readonly selectedDecisionId?: string | null;
}

function AnsweredDecisionItem({ answered, presence }: { readonly answered: AnsweredDecision; readonly presence: ListItemPresence }) {
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

const DOCUMENT_WORDS = { spec: 'spec', plan: 'plan' } as const;

/**
 * "Open the spec at line 16": a spec or plan agent's question opens its document at the line it asks on now, else where it asked, with
 * this question unfolded, whichever other question shares the line.
 */
function DocumentAnchorLink({ decision }: { readonly decision: BoardDecisionDocument }) {
  const hrefOf = useBoardHrefOf();
  const [ticketId] = decision.ticketIds;
  if (decision.document === null || ticketId === undefined) return null;
  const line = decision.placement?.from ?? decision.anchor?.lines.from ?? null;
  const label = line === null ? `Open the ${DOCUMENT_WORDS[decision.document]}` : `Open the ${DOCUMENT_WORDS[decision.document]} at line ${line}`;
  return <Button label={label} href={hrefOf(BoardRouter.documentsRouteOf(ticketId, decision.document, line, decision.id))} />;
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
  const openDecisionList = useRef<HTMLUListElement>(null);
  const answeredDecisionList = useRef<HTMLUListElement>(null);
  const presentDecisions = useListPresence(model.openDecisions, ({ decision }) => decision.id, openDecisionList);
  const presentAnswers = useListPresence(model.answeredDecisions, answeredKeyOf, answeredDecisionList);
  return (
    <div className="board-view" ref={viewElement} data-flint-workplace="" data-question-open={selectedDecisionId === null ? undefined : ''}>
      <PageHead titleElement="h2" title="Questions" lead="Agents stop here when they need User's answer." />
      <ListSection
        label="Open questions"
        title="Open questions"
        count={model.openQuestionCount}
        headEnd={<NotificationAllowanceControl notifier={notifier} />}
        emptyText="No question waits on User."
        items={presentDecisions}
        listRef={openDecisionList}
        keyOf={({ key }) => key}
        renderItem={({ item: { decision, escalated }, presence }) => (
          <DecisionCard
            decision={decision}
            escalated={escalated}
            presence={presence}
            isOpenBeside={decision.id === selectedDecisionId}
            besideAnswer={(
              <>
                <DocumentAnchorLink decision={decision} />
                <Button label="Open beside the board" onPress={() => openQuestionPanel(decision.id)} />
              </>
            )}
          />
        )}
      />
      <ListSection
        label="Answered questions"
        title="Answered"
        emptyText="No answered question yet."
        items={presentAnswers}
        listRef={answeredDecisionList}
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
