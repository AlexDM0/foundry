/**
 * One lettered option of a question: its letter, its label with an optional description under it, then the caller's marks and facts. With
 * a `ChoiceInput` it is a label the radio or checkbox leads, so a click anywhere on it chooses; without, a read-only list item. A chosen
 * option reads bold; the card variant draws it as a bordered card, and the question tone in the question colours. A size other than the
 * standard one sets the option as a compact row, a large option or a roomy card; `mono` sets its label as machine text, and an option with
 * no letter shows none. With a `ChoiceFreeText` it is the Other option: a text field under its label, which takes the focus when the option
 * is chosen and chooses the option when it takes the focus. A disabled input or text field fades the option and ignores a click on it.
 */
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactElement,
  type ReactNode,
  type RefObject
} from 'react';

/** The input and the text field of one option, so each can hand the focus or the choice to the other. */
interface ChoiceFocusLink {
  readonly choiceInput: RefObject<HTMLInputElement | null>;
  readonly freeText:    RefObject<HTMLInputElement | null>;
}

const ChoiceFocusContext = createContext<ChoiceFocusLink | null>(null);

export interface ChoiceInputProps {
  readonly type:           'radio' | 'checkbox';
  /** The group the input belongs to. */
  readonly name:           string;
  readonly checked:        boolean;
  readonly accessibleName: string;
  readonly onChange:       () => void;
  /** The option cannot be chosen now, such as while the choice it would change is on its way. */
  readonly disabled?:      boolean;
}

/** The radio or checkbox of the option around it; choosing it moves the focus into the option's text field, if it has one. */
export function ChoiceInput({
  type, name, checked, accessibleName, onChange, disabled = false
}: ChoiceInputProps) {
  const focusLink = useContext(ChoiceFocusContext);
  return (
    <input
      ref={focusLink?.choiceInput}
      className="design-system-choice-input"
      type={type}
      name={name}
      aria-label={accessibleName}
      checked={checked}
      disabled={disabled}
      onChange={(event) => {
        onChange();
        if (event.currentTarget.checked) focusLink?.freeText.current?.focus();
      }}
    />
  );
}

export interface ChoiceFreeTextProps {
  readonly value:          string;
  readonly placeholder:    string;
  readonly accessibleName: string;
  readonly onChange:       (value: string) => void;
  readonly disabled?:      boolean;
}

/** The text field of the Other option around it: when it takes the focus, it chooses the option unless the option is chosen. */
export function ChoiceFreeText({
  value, placeholder, accessibleName, onChange, disabled = false
}: ChoiceFreeTextProps) {
  const focusLink = useContext(ChoiceFocusContext);
  return (
    <input
      ref={focusLink?.freeText}
      className="design-system-choice-free-text"
      type="text"
      value={value}
      placeholder={placeholder}
      aria-label={accessibleName}
      disabled={disabled}
      onFocus={() => {
        const choiceInput = focusLink?.choiceInput.current;
        if (choiceInput !== null && choiceInput !== undefined && !choiceInput.checked) choiceInput.click();
      }}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

/**
 * `compact` a 36px row centred on its line; `large` the option of a question asked on a panel of its own, its label in the lead size over
 * ruled facts; `roomy` a card with more room round a larger label.
 */
export type ChoiceOptionSize = 'compact' | 'standard' | 'large' | 'roomy';

/** An option that chooses takes its input; only an option that chooses takes a text field of its own words. */
export type ChoiceOptionChoosing =
  | { readonly input?: undefined; readonly freeText?: never }
  | {
    /** `<ChoiceInput type="radio" … />`; absent, the option is read-only and renders as an `li`. */
    readonly input:     ReactElement<ChoiceInputProps>;
    /** `<ChoiceFreeText … />`: the option's own words, typed under its label. */
    readonly freeText?: ReactElement<ChoiceFreeTextProps>;
  };

export type ChoiceOptionProps = ChoiceOptionChoosing & {
  /** Absent, the option shows no letter. */
  readonly letter?:      string;
  readonly label:        string;
  readonly description?: string;
  readonly chosen:       boolean;
  /** Marks after the text, such as recommended or chosen. */
  readonly marks?:       ReactNode;
  /** Facts under the text, such as what the option touches. */
  readonly facts?:       ReactNode;
  readonly variant:      'row' | 'card';
  readonly tone?:        'question';
  readonly size?:        ChoiceOptionSize;
  /** The label is machine text, such as a path: the mono face in the small size. */
  readonly mono?:        boolean;
};

export function ChoiceOption({
  letter, label, description, chosen, marks, input, freeText, facts, variant, tone, size = 'standard', mono = false
}: ChoiceOptionProps) {
  const choiceInput = useRef<HTMLInputElement | null>(null);
  const freeTextField = useRef<HTMLInputElement | null>(null);
  const focusLink = useMemo<ChoiceFocusLink>(() => ({ choiceInput, freeText: freeTextField }), []);
  const content = (
    <>
      {letter === undefined ? null : <span className="design-system-choice-letter">{letter}</span>}
      <span className="design-system-choice-text">
        {label}
        {description === undefined ? null : <span className="design-system-choice-description">{description}</span>}
        {facts === undefined ? null : <span className="design-system-choice-facts">{facts}</span>}
        {freeText}
      </span>
      {marks}
    </>
  );
  const optionAttributes = {
    'data-chosen':  chosen ? '' : undefined,
    'data-variant': variant,
    'data-tone':    tone,
    'data-size':    size === 'standard' ? undefined : size,
    'data-mono':    mono ? '' : undefined,
  };
  if (input === undefined) return <li className="design-system-choice" {...optionAttributes}>{content}</li>;
  return (
    <ChoiceFocusContext.Provider value={focusLink}>
      <label className="design-system-choice" {...optionAttributes}>
        {input}
        {content}
      </label>
    </ChoiceFocusContext.Provider>
  );
}

export interface ChoiceMarkProps {
  readonly mark: 'recommended';
  readonly text: string;
}

/** A word after an option's text, such as the one saying it is recommended: a word, so it never rests on colour alone. */
export function ChoiceMark({ mark, text }: ChoiceMarkProps) {
  return <span className="design-system-choice-mark" data-mark={mark}>{text}</span>;
}
