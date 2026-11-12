/** A checkbox inside its label, with a second line of explanation where one is needed, as each notification kind has. */
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
    <label className="gaia-checkbox">
      <input className="gaia-checkbox-input" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span className="gaia-checkbox-text">
        <span className="gaia-checkbox-label">{label}</span>
        {explanation === undefined ? null : <span className="gaia-checkbox-explanation">{explanation}</span>}
      </span>
    </label>
  );
}
