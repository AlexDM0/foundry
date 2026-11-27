/**
 * A question card: an eyebrow and the question as the legend of a fieldset, then its options as children (a `QuestionOption` for each
 * lettered option, then an optional `QuestionOtherOption` whose words are typed in place), then the answer button. The options are radios of
 * one group, or checkboxes when several may be chosen; the card holds the chosen letters and hands each choice on. Answer waits for a
 * choice, and for words when the Other option is chosen. It glows while it asks; once answered, the green confirmation takes the place of
 * its options. Its options sit stacked, or side by side in equal columns.
 */
import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useState,
  type ReactNode
} from 'react';

import { Button } from '../atoms/Button.tsx';
import { Icon }   from '../atoms/Icon.tsx';
import {
  ChoiceFreeText,
  ChoiceInput,
  ChoiceMark,
  ChoiceOption
} from '../molecules/ChoiceOption.tsx';

interface QuestionChoices {
  readonly groupName:         string;
  readonly inputType:         'radio' | 'checkbox';
  readonly chosen:            readonly string[];
  readonly onChoose:          (letter: string) => void;
  /** Told by the Other option whether it is chosen with no words typed, which keeps Answer disabled. */
  readonly onOwnWordsMissing: (areMissing: boolean) => void;
}

const QuestionChoicesContext = createContext<QuestionChoices | null>(null);

function useQuestionChoices(): QuestionChoices {
  const choices = useContext(QuestionChoicesContext);
  if (choices === null) throw new Error('A question option renders only inside a MultipleChoiceQuestion');
  return choices;
}

export interface MultipleChoiceQuestionProps {
  /** The line over the question, such as "Your decision" or "Question · step 3". */
  readonly eyebrow:       string;
  readonly question:      string;
  /** The chosen options' letters, the Other option's included; empty while none is chosen. */
  readonly chosen:        readonly string[];
  /** Hands on the letter of the option chosen, or toggled when the question is `multiple`. */
  readonly onChoose:      (letter: string) => void;
  readonly answerLabel:   string;
  readonly onAnswer:      () => void;
  /** The options: a `QuestionOption` for each, then an optional `QuestionOtherOption`. */
  readonly children:      ReactNode;
  /** Several options may be chosen: the options are checkboxes, and the holder toggles the letter `onChoose` hands on. */
  readonly multiple?:     boolean;
  /** The options sit side by side in equal columns rather than stacked. */
  readonly columns?:      boolean;
  /** The confirmation once the question is answered; given, the card is answered. */
  readonly answeredText?: string;
  readonly disabled?:     boolean;
}

export function MultipleChoiceQuestion({
  eyebrow, question, chosen, onChoose, answerLabel, onAnswer, children, multiple = false, columns = false, answeredText, disabled = false
}: MultipleChoiceQuestionProps) {
  const groupName = useId();
  const [ownWordsAreMissing, setOwnWordsAreMissing] = useState(false);
  const isAnswered = answeredText !== undefined;
  const answerIsReady = chosen.length > 0 && !ownWordsAreMissing;
  const choices: QuestionChoices = {
    groupName, inputType: multiple ? 'checkbox' : 'radio', chosen, onChoose, onOwnWordsMissing: setOwnWordsAreMissing
  };
  return (
    <fieldset
      className="design-system-question-card"
      data-layout={columns ? 'columns' : 'stack'}
      data-state={isAnswered ? 'answered' : 'asking'}
      disabled={disabled || isAnswered}
    >
      <legend className="design-system-question-card-legend">
        <span className="design-system-question-card-eyebrow">{eyebrow}</span>
        <span className="design-system-question-card-text">{question}</span>
      </legend>
      {isAnswered
        ? (
          <p className="design-system-question-card-answered" role="status">
            <span className="design-system-question-card-answered-glyph"><Icon name="check" label={null} /></span>
            {answeredText}
          </p>
        )
        : (
          <>
            <QuestionChoicesContext.Provider value={choices}>
              <div className="design-system-question-card-options">{children}</div>
            </QuestionChoicesContext.Provider>
            <div className="design-system-question-card-actions">
              <Button label={answerLabel} emphasis="primary" disabled={disabled || !answerIsReady} onPress={onAnswer} />
            </div>
          </>
        )}
    </fieldset>
  );
}

export interface QuestionOptionProps {
  readonly letter:            string;
  readonly label:             string;
  readonly description?:      string;
  /** The word that marks the option as recommended; absent, the option carries no mark. */
  readonly recommendedLabel?: string;
}

/** One lettered option of the question around it: its radio or checkbox chooses its letter. */
export function QuestionOption({
  letter, label, description, recommendedLabel
}: QuestionOptionProps) {
  const {
    groupName, inputType, chosen, onChoose
  } = useQuestionChoices();
  const isChosen = chosen.includes(letter);
  return (
    <ChoiceOption
      letter={letter}
      label={label}
      {...(description === undefined ? {} : { description })}
      {...(recommendedLabel === undefined ? {} : { marks: <ChoiceMark mark="recommended" text={recommendedLabel} /> })}
      chosen={isChosen}
      input={<ChoiceInput type={inputType} name={groupName} checked={isChosen} accessibleName={label} onChange={() => onChoose(letter)} />}
      variant="card"
      tone="question"
    />
  );
}

export interface QuestionOtherOptionProps {
  readonly letter:      string;
  readonly label:       string;
  readonly placeholder: string;
  /** The name of the text field. */
  readonly textLabel:   string;
  readonly text:        string;
  readonly onText:      (text: string) => void;
}

/** The Other option of the question around it: choosing it moves the focus into its text field, and Answer waits for its words. */
export function QuestionOtherOption({
  letter, label, placeholder, textLabel, text, onText
}: QuestionOtherOptionProps) {
  const {
    groupName, inputType, chosen, onChoose, onOwnWordsMissing
  } = useQuestionChoices();
  const isChosen = chosen.includes(letter);
  const ownWordsAreMissing = isChosen && text.trim() === '';
  useLayoutEffect(() => {
    onOwnWordsMissing(ownWordsAreMissing);
  }, [ownWordsAreMissing, onOwnWordsMissing]);
  useLayoutEffect(() => () => onOwnWordsMissing(false), [onOwnWordsMissing]);
  return (
    <ChoiceOption
      letter={letter}
      label={label}
      chosen={isChosen}
      input={<ChoiceInput type={inputType} name={groupName} checked={isChosen} accessibleName={label} onChange={() => onChoose(letter)} />}
      freeText={<ChoiceFreeText value={text} placeholder={placeholder} accessibleName={textLabel} onChange={onText} />}
      variant="card"
      tone="question"
    />
  );
}
