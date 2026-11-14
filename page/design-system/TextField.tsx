/**
 * A 36 px text field inside its label, in the mono face for a path or the UI face for words. A hidden label still names the field for a
 * screen reader where the layout around it already says what it is.
 */
export interface TextFieldProps {
  readonly label:        string;
  readonly value:        string;
  readonly onChange:     (value: string) => void;
  readonly face?:        'mono' | 'ui';
  readonly labelHidden?: boolean;
  readonly disabled?:    boolean;
  readonly placeholder?: string;
}

export function TextField({
  label, value, onChange, face = 'ui', labelHidden = false, disabled = false, placeholder
}: TextFieldProps) {
  return (
    <label className="gaia-text-field">
      <span className="gaia-text-field-label" data-hidden={labelHidden ? '' : undefined}>{label}</span>
      <input
        className="gaia-text-field-input"
        type="text"
        data-face={face}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}
