/**
 * One row of filter chips: each chip leads with its lane dot or epic swatch, shows whether it is pressed and its count, is marked empty at
 * a count of zero, and hands its value on when clicked. Which chips are pressed and what they count is the caller's, from
 * `ChipFilterUtil`. A toolbar's group shows its label before the chips, as the Tickets toolbar does.
 */
import { useId } from 'react';

export interface FilterChip {
  readonly value:       string;
  readonly label:       string;
  /** A state chip leads with the lane dot of this state. */
  readonly stateToken?: string;
  /** An epic chip leads with the swatch of this colour slot. */
  readonly slot?:       number;
}

export interface FilterChipGroupProps {
  readonly label:          string;
  readonly chips:          readonly FilterChip[];
  readonly pressed:        readonly string[];
  readonly countByChip:    ReadonlyMap<string, number>;
  readonly onToggle:       (value: string) => void;
  /** Shows the label before the chips, naming the group; otherwise the label is only the group's accessible name. */
  readonly labelIsShown?:  boolean;
  /** With a shown label: the group takes a line of its own, as the static Status group does. */
  readonly startsOwnLine?: boolean;
}

function FilterChips({
  chips, pressed, countByChip, onToggle
}: Pick<FilterChipGroupProps, 'chips' | 'pressed' | 'countByChip' | 'onToggle'>) {
  return chips.map((chip) => {
    const count = countByChip.get(chip.value) ?? 0;
    return (
      <button
        key={chip.value}
        type="button"
        className="bridge-chip"
        data-chip={chip.value}
        data-state={chip.stateToken}
        data-epic-slot={chip.slot === undefined ? undefined : String(chip.slot)}
        data-empty={count === 0 ? '' : undefined}
        aria-pressed={pressed.includes(chip.value)}
        onClick={() => onToggle(chip.value)}
      >
        {chip.stateToken === undefined ? null : <span className="bridge-lane-dot" data-state={chip.stateToken} />}
        {chip.slot === undefined ? null : <span className="bridge-epic-swatch" aria-hidden="true" />}
        {chip.label}
        {' '}
        <span className="bridge-chip-count">{count}</span>
      </button>
    );
  });
}

export function FilterChipGroup({
  label, chips, pressed, countByChip, onToggle, labelIsShown = false, startsOwnLine = false
}: FilterChipGroupProps) {
  const labelId = useId();
  const chipButtons = <FilterChips chips={chips} pressed={pressed} countByChip={countByChip} onToggle={onToggle} />;
  if (!labelIsShown) return <div className="bridge-chips" role="group" aria-label={label}>{chipButtons}</div>;
  return (
    <div className="bridge-toolbar-group" data-own-line={startsOwnLine ? '' : undefined}>
      <span className="bridge-range-label" id={labelId}>{label}</span>
      <div className="bridge-chips" role="group" aria-labelledby={labelId}>{chipButtons}</div>
    </div>
  );
}
