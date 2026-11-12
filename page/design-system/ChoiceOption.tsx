/** One radio choice as a bordered card: its title and one line of what it leads to. The whole card is the label; the chosen one has an ink ring. */
export interface ChoiceOptionProps {
  /** The radio group's name. */
  readonly name:        string;
  readonly title:       string;
  readonly consequence: string;
  readonly chosen:      boolean;
  readonly onChoose:    () => void;
  readonly disabled?:   boolean;
}

export function ChoiceOption({
  name, title, consequence, chosen, onChoose, disabled = false
}: ChoiceOptionProps) {
  return (
    <label className="gaia-choice" data-chosen={chosen ? '' : undefined}>
      <input className="gaia-choice-input" type="radio" name={name} checked={chosen} disabled={disabled} onChange={onChoose} />
      <span className="gaia-choice-text">
        <span className="gaia-choice-title">{title}</span>
        <span className="gaia-choice-consequence">{consequence}</span>
      </span>
    </label>
  );
}
