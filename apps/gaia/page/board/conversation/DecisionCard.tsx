/**
 * One open decision with its questions and options exactly as asked, answered with `decision-answer`: one choice per question, several
 * when it is multi-select, or User's own words, an option of their own, on a decision of one question (`DecisionOptionList`). Shown as a
 * card in the Questions inbox and docked in an Intake chat, where the questions may stand side by side; the first answer wins, and a later
 * one shows the forge's refusal beside the control.
 */
import { useMemo, type ReactNode } from 'react';

import type { BoardDecisionDocument }                 from '../../@types/board/BoardDecisionDocuments.ts';
import { presenceAttributeOf, type ListItemPresence } from '../../lib/design-system/DesignSystemInterface.ts';
import { CommandButton }                              from '../shared/commands/CommandButton.tsx';
import {
  CardHead,
  JobLink,
  MetaLine,
  TicketLinks,
  type CardPill
} from './ConversationParts.tsx';
import { DecisionAnswerUtil }                                                       from './DecisionAnswerUtil.ts';
import { DecisionOptionList, type DecisionFreeTextChoice, type DecisionOptionLook } from './DecisionOptionList.tsx';
import { useDecisionAnswer }                                                        from './UseDecisionAnswer.ts';

export interface DecisionCardProps {
  readonly decision:        BoardDecisionDocument;
  readonly escalated:       boolean;
  /** A card is an item of a list; docked stands in a chat thread with a warn rule down its left edge. */
  readonly placement?:      'card' | 'docked';
  /** Columns sets the questions side by side, on a window wide enough. */
  readonly questionLayout?: 'stack' | 'columns';
  /** A control beside Answer, such as the inbox's way to open the question beside the board. */
  readonly besideAnswer?:   ReactNode;
  /** Where the card stands in its list's coming and going (`useListPresence`); settled by default. */
  readonly presence?:       ListItemPresence;
  /** The question panel shows this decision beside the board: the card takes the decision tint and says so. */
  readonly isOpenBeside?:   boolean;
}

/** Every decision on the board waits on its answer; an answered one leaves it. */
const OPEN_PILL: CardPill = { state: 'in-progress', label: 'open' };

const OPEN_BESIDE_PILL: CardPill = { state: 'in-progress', label: 'open beside the board' };

const ROW_LOOK: DecisionOptionLook = { variant: 'row' };

interface DecisionFrameProps {
  readonly decision:     BoardDecisionDocument;
  readonly placement:    'card' | 'docked';
  readonly presence:     ListItemPresence;
  readonly isOpenBeside: boolean;
  readonly children:     ReactNode;
}

function DecisionFrame({
  decision, placement, presence, isOpenBeside, children
}: DecisionFrameProps) {
  const label = `Question ${decision.id}`;
  return placement === 'docked'
    ? <section className="board-card" data-state="open" data-placement="docked" aria-label={label}>{children}</section>
    : (
      <li
        className="board-card"
        data-state="open"
        data-open-beside={isOpenBeside ? '' : undefined}
        data-presence={presenceAttributeOf(presence)}
        inert={presence === 'leaving'}
        aria-label={label}
      >
        {children}
      </li>
    );
}

export function DecisionCard({
  decision, escalated, placement = 'card', questionLayout = 'stack', besideAnswer = null, presence = 'settled', isOpenBeside = false
}: DecisionCardProps) {
  const questions = useMemo(() => DecisionAnswerUtil.questionViewsOf(decision), [decision]);
  const decisionAnswer = useDecisionAnswer(questions);
  const freeText: DecisionFreeTextChoice | null = questions.length === 1
    ? {
      text: decisionAnswer.freeText, isChosen: decisionAnswer.freeTextIsChosen, onToggle: decisionAnswer.toggleFreeText, onChange: decisionAnswer.changeFreeText
    }
    : null;
  const questionFields = decision.questions.map((question, questionIndex) => (
    <fieldset key={question.question} className="board-question">
      <legend className="board-draft-question-head">
        <span className="board-question-header">{question.header}</span>
        <span>{question.question}</span>
        {question.multiSelect ? <span className="board-draft-mark" data-mark="multiple">multi-select</span> : null}
      </legend>
      <div className="board-draft-options">
        <DecisionOptionList
          groupName={`${decision.id}-${questionIndex}`}
          question={questions[questionIndex] ?? { multiSelect: question.multiSelect, options: [] }}
          chosen={decisionAnswer.selections[questionIndex] ?? []}
          onChoose={(optionIndex) => decisionAnswer.chooseOption(questionIndex, optionIndex)}
          freeText={freeText}
          look={ROW_LOOK}
        />
      </div>
    </fieldset>
  ));

  return (
    <DecisionFrame decision={decision} placement={placement} presence={presence} isOpenBeside={isOpenBeside}>
      <CardHead id={decision.id} title={decision.kind} pill={isOpenBeside ? OPEN_BESIDE_PILL : OPEN_PILL} />
      <MetaLine parts={[
        decision.ticketIds.length === 0 ? null : <TicketLinks ticketIds={decision.ticketIds} />,
        decision.jobId === null ? null : <>job <JobLink jobId={decision.jobId} /></>,
        `asked by ${decision.askedBy}`,
        escalated ? 'escalated by the Assistant' : null,
      ]} />
      {decision.context === '' ? null : <p className="board-note">{decision.context}</p>}
      {questionLayout === 'columns' ? <div className="board-question-grid">{questionFields}</div> : questionFields}
      <div className="board-card-actions">
        <CommandButton label="Answer" command={DecisionAnswerUtil.commandOf(decision.id, decisionAnswer.answer)} />
        {besideAnswer}
      </div>
    </DecisionFrame>
  );
}
