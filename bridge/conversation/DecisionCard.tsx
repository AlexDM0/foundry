/**
 * One open decision with its questions and options exactly as asked, answered with `decision-answer`: one choice per question, several
 * when it is multi-select, or free text on a decision of one question. Shown as a card in the Questions inbox and docked in an Intake chat,
 * where the questions may stand side by side; the first answer wins, and a later one shows the Overseer's refusal beside the control.
 */
import { useState, type ReactNode } from 'react';

import type { DecisionDocument } from '../@types/ConversationDocuments.ts';
import { ChoiceOption }          from '../design-system/ChoiceOption.tsx';
import { CommandButton }         from '../shell/CommandButton.tsx';
import {
  CardHead,
  JobLink,
  MetaLine,
  TicketLinks,
  type CardPill
} from './ConversationParts.tsx';
import { DecisionAnswerUtil, type QuestionSelections } from './DecisionAnswerUtil.ts';

export interface DecisionCardProps {
  readonly decision:        DecisionDocument;
  readonly escalated:       boolean;
  /** A card is an item of a list; docked stands in a chat thread with a warn rule down its left edge. */
  readonly placement?:      'card' | 'docked';
  /** Columns sets the questions side by side, on a window wide enough. */
  readonly questionLayout?: 'stack' | 'columns';
}

/** Every decision on the board waits on its answer; an answered one leaves it. */
const OPEN_PILL: CardPill = { state: 'in-progress', label: 'open' };

function selectionsAfter(selections: QuestionSelections, questionIndex: number, optionIndex: number, multiSelect: boolean): QuestionSelections {
  const current = selections[questionIndex] ?? [];
  const chosen = multiSelect
    ? (current.includes(optionIndex) ? current.filter((index) => index !== optionIndex) : [...current, optionIndex])
    : [optionIndex];
  return Array.from({ length: Math.max(selections.length, questionIndex + 1) }, (_unused, index) => (index === questionIndex ? chosen : selections[index] ?? []));
}

function DecisionFrame({ decision, placement, children }: { readonly decision: DecisionDocument; readonly placement: 'card' | 'docked'; readonly children: ReactNode }) {
  const label = `Question ${decision.id}`;
  return placement === 'docked'
    ? <section className="bridge-card" data-state="open" data-placement="docked" aria-label={label}>{children}</section>
    : <li className="bridge-card" data-state="open" aria-label={label}>{children}</li>;
}

export function DecisionCard({
  decision, escalated, placement = 'card', questionLayout = 'stack'
}: DecisionCardProps) {
  const [selections, setSelections] = useState<QuestionSelections>([]);
  const [freeText, setFreeText] = useState('');
  const answer = DecisionAnswerUtil.answerOf(decision, selections, freeText);
  const questionFields = decision.questions.map((question, questionIndex) => (
    <fieldset key={question.question} className="bridge-question">
      <legend className="bridge-draft-question-head">
        <span className="bridge-question-header">{question.header}</span>
        <span>{question.question}</span>
        {question.multiSelect ? <span className="bridge-draft-mark" data-mark="multiple">multi-select</span> : null}
      </legend>
      <div className="bridge-draft-options">
        {question.options.map((option, optionIndex) => {
          const letter = DecisionAnswerUtil.optionLetterOf(optionIndex);
          const chosen = (selections[questionIndex] ?? []).includes(optionIndex);
          return (
            <ChoiceOption
              key={option.label}
              letter={letter}
              label={option.label}
              {...(option.description === '' ? {} : { description: option.description })}
              chosen={chosen}
              variant="row"
              input={{
                type:           question.multiSelect ? 'checkbox' : 'radio',
                name:           `${decision.id}-${questionIndex}`,
                checked:        chosen,
                accessibleName: `${letter}. ${option.label}`,
                onChange:       () => setSelections(selectionsAfter(selections, questionIndex, optionIndex, question.multiSelect)),
              }}
            />
          );
        })}
      </div>
    </fieldset>
  ));

  return (
    <DecisionFrame decision={decision} placement={placement}>
      <CardHead id={decision.id} title={decision.kind} pill={OPEN_PILL} />
      <MetaLine parts={[
        decision.ticketIds.length === 0 ? null : <TicketLinks ticketIds={decision.ticketIds} />,
        decision.jobId === null ? null : <>job <JobLink jobId={decision.jobId} /></>,
        `asked by ${decision.askedBy}`,
        escalated ? 'escalated by the Assistant' : null,
      ]} />
      {decision.context === '' ? null : <p className="bridge-note">{decision.context}</p>}
      {questionLayout === 'columns' ? <div className="bridge-question-grid">{questionFields}</div> : questionFields}
      {decision.questions.length === 1
        ? (
          <textarea
            className="bridge-textarea"
            aria-label={`Free-text answer to ${decision.id}`}
            placeholder="Free-text answer"
            value={freeText}
            onChange={(event) => setFreeText(event.target.value)}
          />
        )
        : null}
      <div className="bridge-card-actions">
        <CommandButton label="Answer" command={answer === null ? null : { kind: 'decision-answer', decisionId: decision.id, answer }} />
      </div>
    </DecisionFrame>
  );
}
