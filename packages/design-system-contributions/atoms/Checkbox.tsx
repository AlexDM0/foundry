/**
 * A checkbox inside its label. With a second line of explanation, the label takes the strong weight and stands a little further from the
 * box, so a list of explained choices reads as names with their notes.
 */
export interface CheckboxProps {
  readonly label:        string;
  readonly checked:      boolean;
  readonly onChange:     (checked: boolean) => void;
  readonly explanation?: string;
  readonly disabled?:    boolean;
}

export function Checkbox({
  label, checked, onChange, explanation, disabled = false
}: CheckboxProps) {
  return (
    <label className="design-system-checkbox" data-explained={explanation === undefined ? undefined : ''}>
      <input
        className="design-system-checkbox-input"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className="design-system-checkbox-text">
        <span className="design-system-checkbox-label">{label}</span>
        {explanation === undefined ? null : <span className="design-system-checkbox-explanation">{explanation}</span>}
      </span>
    </label>
  );
}
