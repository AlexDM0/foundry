/**
 * The question panel's left column: the decision card with Flint's slot, each question's options and the answer row. The choices start empty for
 * every decision, since the column is keyed by it.
 */

import type { ReactNode } from 'react';

import type { BoardDecisionDocument }                                               from '../../../../@types/board/BoardDecisionDocuments.ts';
import { Card, Text, View }                                                         from '../../../../lib/design-system/DesignSystemInterface.ts';
import { DecisionAnswerUtil }                                                       from '../../../conversation/DecisionAnswerUtil.ts';
import { DecisionOptionList, type DecisionFreeTextChoice, type DecisionOptionLook } from '../../../conversation/DecisionOptionList.tsx';
import { useDecisionAnswer }                                                        from '../../../conversation/UseDecisionAnswer.ts';
import { FLINT_SLOT_CUES }                                                          from '../../../flint/FlintSlotCues.ts';
import { FlintSlotHabitat }                                                         from '../../../flint/FlintSlotHabitat.tsx';
import { FLINT_SLOT_HABITATS }                                                      from '../../../flint/FlintSlotHabitats.ts';
import { CommandButton }                                                            from '../../../shared/commands/CommandButton.tsx';
import type { QuestionModel, QuestionPanelViewModel }                               from './QuestionPanelModel.ts';

export interface QuestionAskColumnProps {
  readonly decision:          BoardDecisionDocument;
  readonly model:             QuestionPanelViewModel;
  /** False while the panel hides behind the detail panel: a hidden slot would still register and claim the visit target. */
  readonly holdsTheFlintSlot: boolean;
}

const YOUR_DECISION = 'Your decision';

const PANEL_LOOK: DecisionOptionLook = { variant: 'card', tone: 'question', size: 'large' };

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
  readonly freeText:      DecisionFreeTextChoice | null;
}

function QuestionField({
  decisionId, question, questionIndex, showsQuestion, chosen, onChoose, freeText
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
        <DecisionOptionList
          groupName={`${decisionId}-panel-${questionIndex}`}
          question={question}
          chosen={chosen}
          onChoose={onChoose}
          freeText={freeText}
          look={PANEL_LOOK}
          shownLetterOf={(letter) => `${letter}.`}
        />
      </fieldset>
    </div>
  );
}

export function QuestionAskColumn({ decision, model, holdsTheFlintSlot }: QuestionAskColumnProps) {
  const decisionAnswer = useDecisionAnswer(model.questions);
  const freeText: DecisionFreeTextChoice | null = model.ownWordsAllowed
    ? {
      text: decisionAnswer.freeText, isChosen: decisionAnswer.freeTextIsChosen, onToggle: decisionAnswer.toggleFreeText, onChange: decisionAnswer.changeFreeText
    }
    : null;
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
          chosen={decisionAnswer.selections[questionIndex] ?? []}
          onChoose={(optionIndex) => decisionAnswer.chooseOption(questionIndex, optionIndex)}
          freeText={freeText}
        />
      ))}
      <div className="board-question-panel-answer-row">
        <span>
          {'Posts '}
          <span className="board-question-panel-command">{model.answerLineText}</span>
          {` for ${model.head.askerText}`}
        </span>
        <CommandButton
          label={`Answer ${decision.id}`}
          primary
          command={DecisionAnswerUtil.commandOf(decision.id, decisionAnswer.answer)}
        />
      </div>
    </section>
  );
}
