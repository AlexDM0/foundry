/**
 * One open decision with its questions and options exactly as asked, answered with `decision-answer`: one choice per question, several
 * when it is multi-select, or free text on a decision of one question. Shown in the Questions inbox and inline in an Intake panel; the
 * first answer wins, and a later one shows the Overseer's refusal beside the control.
 */
import { useState } from 'react';

import type { DecisionDocument } from '../@types/ConversationDocuments.ts';
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
  readonly decision:  DecisionDocument;
  readonly escalated: boolean;
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

export function DecisionCard({ decision, escalated }: DecisionCardProps) {
  const [selections, setSelections] = useState<QuestionSelections>([]);
  const [freeText, setFreeText] = useState('');
  const answer = DecisionAnswerUtil.answerOf(decision, selections, freeText);

  return (
    <li className="bridge-card" data-state="open" aria-label={`Question ${decision.id}`}>
      <CardHead id={decision.id} title={decision.kind} pill={OPEN_PILL} />
      <MetaLine parts={[
        decision.ticketIds.length === 0 ? null : <TicketLinks ticketIds={decision.ticketIds} />,
        decision.jobId === null ? null : <>job <JobLink jobId={decision.jobId} /></>,
        `asked by ${decision.askedBy}`,
        escalated ? 'escalated by the Assistant' : null,
      ]} />
      {decision.context === '' ? null : <p className="bridge-note">{decision.context}</p>}
      {decision.questions.map((question, questionIndex) => (
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
                <label key={option.label} className="bridge-draft-option" data-chosen={chosen ? '' : undefined}>
                  <input
                    className="bridge-option-input"
                    type={question.multiSelect ? 'checkbox' : 'radio'}
                    name={`${decision.id}-${questionIndex}`}
                    aria-label={`${letter}. ${option.label}`}
                    checked={chosen}
                    onChange={() => setSelections(selectionsAfter(selections, questionIndex, optionIndex, question.multiSelect))}
                  />
                  <span className="bridge-draft-option-letter">{letter}</span>
                  <span className="bridge-draft-option-text">
                    {option.label}
                    {option.description === '' ? null : <span className="bridge-option-description">{option.description}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
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
    </li>
  );
}
