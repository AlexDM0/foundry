/**
 * The panel's left column: each question as asked, its options as cards with what each touches, trades off and does to the Acceptance
 * when the agent noted it, User's own words on a decision of one question, and the answer row naming the command it posts. The choices
 * start empty for every decision, since the column is keyed by it.
 */
import { useState } from 'react';

import type { DecisionDocument }                       from '../../@types/ConversationDocuments.ts';
import { DecisionAnswerUtil, type QuestionSelections } from '../../conversation/DecisionAnswerUtil.ts';
import { OptionConsequenceFacts }                      from '../../conversation/OptionConsequenceFacts.tsx';
import { ChoiceOption }                                from '../../design-system/ChoiceOption.tsx';
import { CommandButton }                               from '../../shell/CommandButton.tsx';
import type { QuestionModel, QuestionPanelViewModel }  from './QuestionPanelModel.ts';

export interface QuestionAskColumnProps {
  readonly decision: DecisionDocument;
  readonly model:    QuestionPanelViewModel;
}

interface QuestionFieldProps {
  readonly decisionId:    string;
  readonly question:      QuestionModel;
  readonly questionIndex: number;
  readonly showsHeader:   boolean;
  readonly chosen:        readonly number[];
  readonly onChoose:      (optionIndex: number) => void;
}

function QuestionField({
  decisionId, question, questionIndex, showsHeader, chosen, onChoose
}: QuestionFieldProps) {
  const textId = `${decisionId}-question-${questionIndex}`;
  return (
    <div className="bridge-question-panel-question">
      <p className="bridge-question-panel-text" id={textId}>
        {showsHeader ? <span className="bridge-question-header">{question.header}</span> : null}
        {question.text}
      </p>
      <fieldset className="bridge-question-panel-options" aria-labelledby={textId}>
        {question.options.map((option, optionIndex) => {
          const isChosen = chosen.includes(optionIndex);
          return (
            <ChoiceOption
              key={option.label}
              letter={option.letter}
              label={option.label}
              {...(option.description === null ? {} : { description: option.description })}
              chosen={isChosen}
              {...(option.consequences === null ? {} : { facts: <OptionConsequenceFacts consequences={option.consequences} /> })}
              variant="card"
              input={{
                type:           question.multiSelect ? 'checkbox' : 'radio',
                name:           `${decisionId}-panel-${questionIndex}`,
                checked:        isChosen,
                accessibleName: `${option.letter}. ${option.label}`,
                onChange:       () => onChoose(optionIndex),
              }}
            />
          );
        })}
      </fieldset>
    </div>
  );
}

export function QuestionAskColumn({ decision, model }: QuestionAskColumnProps) {
  const [selections, setSelections] = useState<QuestionSelections>([]);
  const [ownWords, setOwnWords] = useState('');
  const answer = DecisionAnswerUtil.answerOf(decision, selections, model.ownWordsAllowed ? ownWords : '');
  const ownWordsId = `${decision.id}-own-words`;
  return (
    <section className="bridge-question-panel-ask" aria-label="The question">
      {model.questions.map((question, questionIndex) => (
        <QuestionField
          key={question.text}
          decisionId={decision.id}
          question={question}
          questionIndex={questionIndex}
          showsHeader={model.questions.length > 1}
          chosen={selections[questionIndex] ?? []}
          onChoose={(optionIndex) => setSelections(DecisionAnswerUtil.selectionsAfter(selections, questionIndex, optionIndex, question.multiSelect))}
        />
      ))}
      {model.ownWordsAllowed
        ? (
          <div className="bridge-question-panel-own-words">
            <label htmlFor={ownWordsId}>Or answer in User&apos;s own words</label>
            <textarea id={ownWordsId} className="bridge-textarea" value={ownWords} onChange={(event) => setOwnWords(event.target.value)} />
          </div>
        )
        : null}
      <div className="bridge-question-panel-answer-row">
        <span>
          {'Posts '}
          <span className="bridge-question-panel-command">{model.answerLineText}</span>
          {` for ${model.head.askerText}`}
        </span>
        <CommandButton
          label={`Answer ${decision.id}`}
          primary
          command={answer === null ? null : { kind: 'decision-answer', decisionId: decision.id, answer }}
        />
      </div>
    </section>
  );
}
