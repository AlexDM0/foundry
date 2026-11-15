/**
 * A 36px text field inside its label, in the interface face for words or the mono face for machine text. A hidden label still names the
 * field for a screen reader where the layout around it already says what the field is.
 */
export interface TextFieldProps {
  readonly label:        string;
  readonly value:        string;
  readonly onChange:     (value: string) => void;
  readonly mono?:        boolean;
  readonly labelHidden?: boolean;
  readonly disabled?:    boolean;
  readonly placeholder?: string;
}

const flagAttribute = (isSet: boolean | undefined) => (isSet === true ? '' : undefined);

export function TextField({
  label, value, onChange, mono, labelHidden, disabled = false, placeholder
}: TextFieldProps) {
  return (
    <label className="design-system-text-field">
      <span className="design-system-text-field-label" data-hidden={flagAttribute(labelHidden)}>{label}</span>
      <input
        className="design-system-text-field-input"
        type="text"
        data-mono={flagAttribute(mono)}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}
