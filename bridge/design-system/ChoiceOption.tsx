/**
 * One lettered option of a question: its letter, its label with an optional description under it, then the caller's marks and facts. With
 * an input it is a label the radio or checkbox leads, so a click anywhere on it chooses; without, a read-only list item. A chosen option
 * reads bold; the card variant draws it as a bordered card.
 */
import type { ReactNode } from 'react';

export interface ChoiceInput {
  readonly type:           'radio' | 'checkbox';
  /** The group the input belongs to. */
  readonly name:           string;
  readonly checked:        boolean;
  readonly accessibleName: string;
  readonly onChange:       () => void;
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
  /** Facts under the text, such as what the option touches. */
  readonly facts?:       ReactNode;
  readonly variant:      'row' | 'card';
}

export function ChoiceOption({
  letter, label, description, chosen, marks, input, facts, variant
}: ChoiceOptionProps) {
  const content = (
    <>
      <span className="bridge-choice-letter">{letter}</span>
      <span className="bridge-choice-text">
        {label}
        {description === undefined ? null : <span className="bridge-choice-description">{description}</span>}
        {facts === undefined ? null : <span className="bridge-choice-facts">{facts}</span>}
      </span>
      {marks}
    </>
  );
  const chosenAttribute = chosen ? '' : undefined;
  if (input === undefined) return <li className="bridge-choice" data-chosen={chosenAttribute} data-variant={variant}>{content}</li>;
  return (
    <label className="bridge-choice" data-chosen={chosenAttribute} data-variant={variant}>
      <input
        className="bridge-choice-input"
        type={input.type}
        name={input.name}
        aria-label={input.accessibleName}
        checked={input.checked}
        onChange={input.onChange}
      />
      {content}
    </label>
  );
}
