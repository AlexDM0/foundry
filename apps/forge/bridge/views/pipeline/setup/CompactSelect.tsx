/**
 * The entities step's 32px native select, as the boards draw the kind of an entity, the package to whitelist and the fold's target: the
 * options as given, an optional first option that only prompts, and the chevron over the field's end.
 */
export interface CompactSelectOption {
  readonly value: string;
  readonly label: string;
}

export interface CompactSelectProps {
  readonly accessibleName: string;
  readonly value:          string;
  readonly options:        readonly CompactSelectOption[];
  readonly onChange:       (value: string) => void;
  /** The first option, which chooses nothing, such as "Add a package". */
  readonly prompt?:        string;
  readonly disabled?:      boolean;
}

export function CompactSelect({
  accessibleName, value, options, onChange, prompt, disabled = false
}: CompactSelectProps) {
  return (
    <span className="bridge-compact-select">
      <select aria-label={accessibleName} value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)}>
        {prompt === undefined ? null : <option value="">{prompt}</option>}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <svg className="bridge-compact-select-chevron" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M3 4.5 L6 7.5 L9 4.5" />
      </svg>
    </span>
  );
}
