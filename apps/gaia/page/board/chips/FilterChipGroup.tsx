/**
 * One row of filter chips: each chip leads with its lane dot or epic swatch, shows whether it is pressed and its count, is marked empty at
 * a count of zero, and hands its value on when clicked. Which chips are pressed and what they count is the caller's, from
 * `ChipFilterUtil`. A toolbar's group shows its label before the chips, as the Tickets toolbar does.
 */

import { useId } from 'react';

import type { BoardDisplayState }   from '../../@types/board/BoardVocabulary.ts';
import { MicroCapsLabel, StateDot } from '../../lib/design-system/DesignSystemInterface.ts';
import { StateToneUtil }            from '../utils/StateToneUtil.ts';

export interface FilterChip {
  readonly value:       string;
  readonly label:       string;
  /** A state chip leads with the lane dot of this state. */
  readonly stateToken?: BoardDisplayState;
  /** An epic chip leads with the swatch of this colour slot. */
  readonly slot?:       number;
}

export interface FilterChipGroupProps {
  readonly label:         string;
  readonly chips:         readonly FilterChip[];
  readonly pressed:       readonly string[];
  readonly countByChip:   ReadonlyMap<string, number>;
  readonly onToggle:      (value: string) => void;
  /** Shows the label before the chips, naming the group; otherwise the label is only the group's accessible name. */
  readonly labelIsShown?: boolean;
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
        className="board-chip"
        data-chip={chip.value}
        data-state={chip.stateToken}
        data-state-tone={StateToneUtil.optionalToneOf(chip.stateToken)}
        data-epic-slot={chip.slot === undefined ? undefined : String(chip.slot)}
        data-empty={count === 0 ? '' : undefined}
        aria-pressed={pressed.includes(chip.value)}
        onClick={() => onToggle(chip.value)}
      >
        {chip.stateToken === undefined ? null : <StateDot {...StateToneUtil.dotOf(chip.stateToken)} small />}
        {chip.slot === undefined ? null : <span className="board-epic-swatch" aria-hidden="true" />}
        {chip.label}
        {' '}
        <span className="board-chip-count">{count}</span>
      </button>
    );
  });
}

export function FilterChipGroup({
  label, chips, pressed, countByChip, onToggle, labelIsShown = false
}: FilterChipGroupProps) {
  const labelId = useId();
  const chipButtons = <FilterChips chips={chips} pressed={pressed} countByChip={countByChip} onToggle={onToggle} />;
  if (!labelIsShown) return <div className="board-chips" role="group" aria-label={label}>{chipButtons}</div>;
  return (
    <div className="board-toolbar-group">
      <span className="board-toolbar-group-label"><MicroCapsLabel text={label} id={labelId} /></span>
      <div className="board-chips" role="group" aria-labelledby={labelId}>{chipButtons}</div>
    </div>
  );
}
