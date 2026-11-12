/**
 * A question card: an eyebrow and the question as the legend of a fieldset, its lettered options as radios in the question colours, or
 * checkboxes when several may be chosen, the recommended ones marked by a word, an Other option whose words are typed in place, and the
 * answer button. It glows while it asks; once
 * answered, the green confirmation takes the place of its options. Its options sit side by side in equal columns or stacked.
 */
import { useId } from 'react';

import { Button }                   from './Button.tsx';
import { ChoiceMark, ChoiceOption } from './ChoiceOption.tsx';

export interface QuestionOption {
  readonly letter:       string;
  readonly text:         string;
  readonly description?: string;
}

export interface MultipleChoiceQuestionProps {
  /** The micro-caps line over the question, such as "Question · gate 3". */
  readonly eyebrow:            string;
  readonly question:           string;
  readonly options:            readonly QuestionOption[];
  readonly recommendedLetters: readonly string[];
  readonly recommendedLabel:   string;
  /** The Other option's letter, after the options' own. */
  readonly otherLetter:        string;
  readonly otherLabel:         string;
  readonly otherPlaceholder:   string;
  /** The name of the Other option's text field. */
  readonly otherTextLabel:     string;
  readonly layout:             'columns' | 'stack';
  /** Several options may be chosen: the options are checkboxes, and the holder toggles the letter `onChoose` hands on. */
  readonly multiple:           boolean;
  /** The chosen options' letters, the Other option's included; empty while none is chosen. */
  readonly chosen:             readonly string[];
  /** Hands on the letter of the option chosen, or toggled when the question is multiple. */
  readonly onChoose:           (letter: string) => void;
  readonly otherText:          string;
  readonly onOtherText:        (text: string) => void;
  readonly answerLabel:        string;
  readonly onAnswer:           () => void;
  /** The confirmation once the question is answered; given, the card is answered. */
  readonly answeredText?:      string;
  readonly disabled?:          boolean;
}

export function MultipleChoiceQuestion({
  eyebrow, question, options, recommendedLetters, recommendedLabel, otherLetter, otherLabel, otherPlaceholder, otherTextLabel, layout,
  multiple, chosen, onChoose, otherText, onOtherText, answerLabel, onAnswer, answeredText, disabled = false
}: MultipleChoiceQuestionProps) {
  const groupName = useId();
  const isAnswered = answeredText !== undefined;
  const inputType = multiple ? 'checkbox' : 'radio';
  const otherIsChosen = chosen.includes(otherLetter);
  const answerIsReady = chosen.length > 0 && (!otherIsChosen || otherText.trim() !== '');
  return (
    <fieldset
      className="bridge-question-card"
      data-layout={layout}
      data-state={isAnswered ? 'answered' : 'asking'}
      disabled={disabled || isAnswered}
    >
      <legend className="bridge-question-card-legend">
        <span className="bridge-question-card-eyebrow">{eyebrow}</span>
        <span className="bridge-question-card-text">{question}</span>
      </legend>
      {isAnswered
        ? (
          <p className="bridge-question-card-answered" role="status">
            <svg className="bridge-question-card-answered-glyph" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 6.5L5 9l5-6" />
            </svg>
            {answeredText}
          </p>
        )
        : (
          <>
            <div className="bridge-question-card-options">
              {options.map((option) => (
                <ChoiceOption
                  key={option.letter}
                  letter={option.letter}
                  label={option.text}
                  {...(option.description === undefined ? {} : { description: option.description })}
                  {...(recommendedLetters.includes(option.letter) ? { marks: <ChoiceMark mark="recommended" text={recommendedLabel} /> } : {})}
                  chosen={chosen.includes(option.letter)}
                  input={{
                    type:           inputType,
                    name:           groupName,
                    checked:        chosen.includes(option.letter),
                    accessibleName: option.text,
                    onChange:       () => onChoose(option.letter),
                  }}
                  variant="card"
                  tone="question"
                />
              ))}
              <ChoiceOption
                letter={otherLetter}
                label={otherLabel}
                chosen={otherIsChosen}
                input={{
                  type:           inputType,
                  name:           groupName,
                  checked:        otherIsChosen,
                  accessibleName: otherLabel,
                  onChange:       () => onChoose(otherLetter),
                }}
                freeText={{
                  value:          otherText,
                  placeholder:    otherPlaceholder,
                  accessibleName: otherTextLabel,
                  onChange:       onOtherText,
                }}
                variant="card"
                tone="question"
              />
            </div>
            <div className="bridge-question-card-actions">
              <Button label={answerLabel} emphasis="primary" disabled={disabled || !answerIsReady} onPress={onAnswer} />
            </div>
          </>
        )}
    </fieldset>
  );
}
