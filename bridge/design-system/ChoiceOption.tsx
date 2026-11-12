/**
 * One lettered option of a question: its letter, its label with an optional description under it, then the caller's marks and facts. With
 * an input it is a label the radio or checkbox leads, so a click anywhere on it chooses; without, a read-only list item. A chosen option
 * reads bold; the card variant draws it as a bordered card, and the question tone in the question colours. With `freeText` it is the
 * Other option: a text field under its label, which takes the focus when the option is chosen and chooses the option when it takes the
 * focus.
 */
import { useRef, type ReactNode } from 'react';

export interface ChoiceInput {
  readonly type:           'radio' | 'checkbox';
  /** The group the input belongs to. */
  readonly name:           string;
  readonly checked:        boolean;
  readonly accessibleName: string;
  readonly onChange:       () => void;
}

export interface ChoiceFreeText {
  readonly value:          string;
  readonly placeholder:    string;
  readonly accessibleName: string;
  readonly onChange:       (value: string) => void;
}

export interface ChoiceOptionProps {
  readonly letter:       string;
  readonly label:        string;
  readonly description?: string;
  readonly chosen:       boolean;
  /** Marks after the text, such as recommended or chosen. */
  readonly marks?:       ReactNode;
  /** Absent, the option is read-only and renders as an `li`. */
  readonly input?:       ChoiceInput;
  /** The option's own words, typed under its label; it needs `input`. */
  readonly freeText?:    ChoiceFreeText;
  /** Facts under the text, such as what the option touches. */
  readonly facts?:       ReactNode;
  readonly variant:      'row' | 'card';
  readonly tone?:        'question';
}

export function ChoiceOption({
  letter, label, description, chosen, marks, input, freeText, facts, variant, tone
}: ChoiceOptionProps) {
  const choiceInputRef = useRef<HTMLInputElement | null>(null);
  const freeTextRef = useRef<HTMLInputElement | null>(null);
  const content = (
    <>
      <span className="bridge-choice-letter">{letter}</span>
      <span className="bridge-choice-text">
        {label}
        {description === undefined ? null : <span className="bridge-choice-description">{description}</span>}
        {facts === undefined ? null : <span className="bridge-choice-facts">{facts}</span>}
        {freeText === undefined || input === undefined ? null : (
          <input
            ref={freeTextRef}
            className="bridge-choice-free-text"
            type="text"
            value={freeText.value}
            placeholder={freeText.placeholder}
            aria-label={freeText.accessibleName}
            onFocus={() => {
              if (choiceInputRef.current?.checked !== true) input.onChange();
            }}
            onChange={(event) => freeText.onChange(event.currentTarget.value)}
          />
        )}
      </span>
      {marks}
    </>
  );
  const optionAttributes = { 'data-chosen': chosen ? '' : undefined, 'data-variant': variant, 'data-tone': tone };
  if (input === undefined) return <li className="bridge-choice" {...optionAttributes}>{content}</li>;
  return (
    <label className="bridge-choice" {...optionAttributes}>
      <input
        ref={choiceInputRef}
        className="bridge-choice-input"
        type={input.type}
        name={input.name}
        aria-label={input.accessibleName}
        checked={input.checked}
        onChange={() => {
          input.onChange();
          freeTextRef.current?.focus();
        }}
      />
      {content}
    </label>
  );
}

export interface ChoiceMarkProps {
  readonly mark: 'recommended';
  readonly text: string;
}

/** A word after an option's text, such as the one saying it is recommended: a word, so it never rests on colour alone. */
export function ChoiceMark({ mark, text }: ChoiceMarkProps) {
  return <span className="bridge-choice-mark" data-mark={mark}>{text}</span>;
}
