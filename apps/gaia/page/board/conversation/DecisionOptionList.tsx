/**
 * One question's options as every decision card draws them: each lettered, the agent's recommendation a mark beside it and never chosen
 * for User, with what it touches, trades off and does to the Acceptance; then, on a decision of one question, User's own words as an
 * option of its own. The card around it keeps the answer (`useDecisionAnswer`) and sets the look.
 */
import {
  ChoiceFreeText,
  ChoiceInput,
  ChoiceMark,
  ChoiceOption,
  type ChoiceOptionSize
} from '../../lib/design-system/DesignSystemInterface.ts';

import type { DecisionQuestionView }                      from './DecisionAnswerUtil.ts';
import { OptionConsequenceFacts, type OptionFactsLayout } from './OptionConsequenceFacts.tsx';

export interface DecisionFreeTextChoice {
  readonly text:     string;
  readonly isChosen: boolean;
  readonly onToggle: () => void;
  readonly onChange: (text: string) => void;
}

export interface DecisionOptionLook {
  readonly variant: 'row' | 'card';
  readonly tone?:   'question';
  readonly size?:   ChoiceOptionSize;
  /** `lines` for a card too narrow for a mark column and a fact table; `table` by default. */
  readonly facts?:  OptionFactsLayout;
}

export interface DecisionOptionListProps {
  /** The radio or checkbox group of the question, unique on the page. */
  readonly groupName:      string;
  readonly question:       DecisionQuestionView;
  readonly chosen:         readonly number[];
  readonly onChoose:       (optionIndex: number) => void;
  /** `null` where the question takes no words of User's own, as on a decision of several questions. */
  readonly freeText:       DecisionFreeTextChoice | null;
  readonly look:           DecisionOptionLook;
  /** The letter as the card shows it, such as `a.` or `A`; the letter itself by default. */
  readonly shownLetterOf?: (letter: string) => string;
  /** The answer can no longer be given: every option fades and takes no click. */
  readonly disabled?:      boolean;
}

const OWN_WORDS_LABEL = 'Or answer in your own words';

export function DecisionOptionList({
  groupName, question, chosen, onChoose, freeText, look, shownLetterOf = (letter) => letter, disabled = false
}: DecisionOptionListProps) {
  const inputType = question.multiSelect ? 'checkbox' : 'radio';
  const factsLayout = look.facts ?? 'table';
  const lookProps = {
    variant: look.variant,
    ...(look.tone === undefined ? {} : { tone: look.tone }),
    ...(look.size === undefined ? {} : { size: look.size }),
  };
  return (
    <>
      {question.options.map((option, optionIndex) => {
        const isChosen = chosen.includes(optionIndex);
        return (
          <ChoiceOption
            key={option.letter}
            letter={shownLetterOf(option.letter)}
            label={option.label}
            {...(option.description === null ? {} : { description: option.description })}
            chosen={isChosen}
            {...(option.recommended && factsLayout === 'table' ? { marks: <ChoiceMark mark="recommended" text="Recommended" /> } : {})}
            {...(option.consequences === null && !(option.recommended && factsLayout === 'lines')
              ? {}
              : { facts: <OptionConsequenceFacts consequences={option.consequences} layout={factsLayout} recommended={option.recommended} /> })}
            {...lookProps}
            input={(
              <ChoiceInput
                type={inputType}
                name={groupName}
                checked={isChosen}
                accessibleName={`${option.letter}. ${option.label}`}
                disabled={disabled}
                onChange={() => onChoose(optionIndex)}
              />
            )}
          />
        );
      })}
      {freeText === null
        ? null
        : (
          <ChoiceOption
            letter=""
            label={OWN_WORDS_LABEL}
            chosen={freeText.isChosen}
            {...lookProps}
            input={<ChoiceInput type={inputType} name={groupName} checked={freeText.isChosen} accessibleName={OWN_WORDS_LABEL} disabled={disabled} onChange={freeText.onToggle} />}
            freeText={(
              <ChoiceFreeText
                value={freeText.text}
                placeholder="Your answer"
                accessibleName="Your answer in your own words"
                disabled={disabled}
                onChange={freeText.onChange}
              />
            )}
          />
        )}
    </>
  );
}
