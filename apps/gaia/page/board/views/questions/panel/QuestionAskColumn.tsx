/**
 * The panel's left column: the orange decision card, where Flint waits beside "Your decision" and the question (or the count of questions
 * on a decision of several), its slot left out while the panel hides behind the detail panel, which holds the page's one slot; then each
 * question's options as cards, the agent's recommendation a pill beside its option, with what each touches, trades off and does to the
 * Acceptance when the agent noted it; User's own words on a decision of one question; and the answer row naming the command it posts. The
 * choices start empty for every decision, since the column is keyed by it.
 */

import { useState, type ReactNode } from 'react';

import { PAGE_CONTRACT_VERSIONS }     from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardDecisionDocument } from '../../../../@types/board/BoardDecisionDocuments.ts';
import {
  Card,
  ChoiceInput,
  ChoiceMark,
  ChoiceOption,
  Text,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { DecisionAnswerUtil, type QuestionSelections } from '../../../conversation/DecisionAnswerUtil.ts';
import { OptionConsequenceFacts }                      from '../../../conversation/OptionConsequenceFacts.tsx';
import { FLINT_SLOT_CUES }                             from '../../../flint/FlintSlotCues.ts';
import { FlintSlotHabitat }                            from '../../../flint/FlintSlotHabitat.tsx';
import { FLINT_SLOT_HABITATS }                         from '../../../flint/FlintSlotHabitats.ts';
import { CommandButton }                               from '../../../shared/commands/CommandButton.tsx';
import type { QuestionModel, QuestionPanelViewModel }  from './QuestionPanelModel.ts';

export interface QuestionAskColumnProps {
  readonly decision:          BoardDecisionDocument;
  readonly model:             QuestionPanelViewModel;
  /** False while the panel hides behind the detail panel: a hidden slot would still register and claim the visit target. */
  readonly holdsTheFlintSlot: boolean;
}

const YOUR_DECISION = 'Your decision';

function questionTextIdOf(decisionId: string, questionIndex: number): string {
  return `${decisionId}-question-${questionIndex}`;
}

interface DecisionHeadProps {
  readonly model:             QuestionPanelViewModel;
  readonly holdsTheFlintSlot: boolean;
}

/** What waits on User: Flint beside the eyebrow and the question a decision of one question asks, or how many a decision of several asks. */
function DecisionHead({ model, holdsTheFlintSlot }: DecisionHeadProps) {
  const [onlyQuestion] = model.questions;
  const asksOneQuestion = model.questions.length === 1 && onlyQuestion !== undefined;
  const eyebrowText = asksOneQuestion ? `${YOUR_DECISION} · ${onlyQuestion.header}` : YOUR_DECISION;
  return (
    <Card decision row centerY gap="fourteen" paddingVertical="six" paddingLeft="eighteen" paddingRight="sixteen">
      {holdsTheFlintSlot
        ? (
          <FlintSlotHabitat
            habitat={FLINT_SLOT_HABITATS.questions}
            cue={FLINT_SLOT_CUES.AGENT_WAITS_ON_USER}
            label="Flint, the agent that asks"
            ground="decision"
          />
        )
        : null}
      <View gap="four">
        <span className="board-question-panel-eyebrow">{eyebrowText}</span>
        <Text typeRole="title" element="p" bold {...(asksOneQuestion ? { id: questionTextIdOf(model.decisionId, 0) } : {})}>
          {asksOneQuestion ? onlyQuestion.text : `${model.questions.length} questions from ${model.head.askerText}`}
        </Text>
      </View>
    </Card>
  );
}

interface QuestionFieldProps {
  readonly decisionId:    string;
  readonly question:      QuestionModel;
  readonly questionIndex: number;
  /** A decision of several questions heads each with its header and text; one question is the decision card's own. */
  readonly showsQuestion: boolean;
  readonly chosen:        readonly number[];
  readonly onChoose:      (optionIndex: number) => void;
}

function QuestionField({
  decisionId, question, questionIndex, showsQuestion, chosen, onChoose
}: QuestionFieldProps) {
  const textId = questionTextIdOf(decisionId, questionIndex);
  const heading: ReactNode = showsQuestion
    ? (
      <p className="board-question-panel-text" id={textId}>
        <span className="board-question-header">{question.header}</span>
        {question.text}
      </p>
    )
    : null;
  return (
    <div className="board-question-panel-question">
      {heading}
      <fieldset className="board-question-panel-options" aria-labelledby={textId}>
        {question.options.map((option, optionIndex) => {
          const isChosen = chosen.includes(optionIndex);
          return (
            <ChoiceOption
              key={option.label}
              letter={`${option.letter}.`}
              label={option.label}
              {...(option.description === null ? {} : { description: option.description })}
              chosen={isChosen}
              {...(option.isRecommended ? { marks: <ChoiceMark mark="recommended" text="Recommended" /> } : {})}
              {...(option.consequences === null ? {} : { facts: <OptionConsequenceFacts consequences={option.consequences} /> })}
              variant="card"
              tone="question"
              size="large"
              input={(
                <ChoiceInput
                  type={question.multiSelect ? 'checkbox' : 'radio'}
                  name={`${decisionId}-panel-${questionIndex}`}
                  checked={isChosen}
                  accessibleName={`${option.letter}. ${option.label}`}
                  onChange={() => onChoose(optionIndex)}
                />
              )}
            />
          );
        })}
      </fieldset>
    </div>
  );
}

export function QuestionAskColumn({ decision, model, holdsTheFlintSlot }: QuestionAskColumnProps) {
  const [selections, setSelections] = useState<QuestionSelections>([]);
  const [ownWords, setOwnWords] = useState('');
  const answer = DecisionAnswerUtil.answerOf(decision, selections, model.ownWordsAllowed ? ownWords : '');
  const ownWordsId = `${decision.id}-own-words`;
  return (
    <section className="board-question-panel-ask" aria-label="The question">
      <DecisionHead model={model} holdsTheFlintSlot={holdsTheFlintSlot} />
      {model.questions.map((question, questionIndex) => (
        <QuestionField
          key={question.text}
          decisionId={decision.id}
          question={question}
          questionIndex={questionIndex}
          showsQuestion={model.questions.length > 1}
          chosen={selections[questionIndex] ?? []}
          onChoose={(optionIndex) => setSelections(DecisionAnswerUtil.selectionsAfter(selections, questionIndex, optionIndex, question.multiSelect))}
        />
      ))}
      {model.ownWordsAllowed
        ? (
          <div className="board-question-panel-own-words">
            <label htmlFor={ownWordsId}>Or answer in your own words</label>
            <textarea id={ownWordsId} className="board-textarea" value={ownWords} onChange={(event) => setOwnWords(event.target.value)} />
          </div>
        )
        : null}
      <div className="board-question-panel-answer-row">
        <span>
          {'Posts '}
          <span className="board-question-panel-command">{model.answerLineText}</span>
          {` for ${model.head.askerText}`}
        </span>
        <CommandButton
          label={`Answer ${decision.id}`}
          primary
          command={answer === null ? null : {
            boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'decision-answer', decisionId: decision.id, answer
          }}
        />
      </div>
    </section>
  );
}
