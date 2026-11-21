/**
 * A mono chip of the entities step with its own remove button: a home folder, a whitelisted package or a reach path. A refused chip takes
 * the error colours and says in a few words why; a chip that may not go keeps its button disabled, with the reason as its title. The
 * button sits inside the chip with no edge of its own, as the boards draw "apps/web ×".
 */
export interface RemovableChipProps {
  readonly text:        string;
  readonly removeLabel: string;
  readonly onRemove:    () => void;
  /** Why the forge refuses the chip, in a few words. */
  readonly refused?:    string | null;
  /** Why the chip may not go now; its button is then disabled. */
  readonly keepReason?: string | null;
  readonly disabled?:   boolean;
}

export function RemovableChip({
  text, removeLabel, onRemove, refused = null, keepReason = null, disabled = false
}: RemovableChipProps) {
  return (
    <span className="board-removable-chip" data-refused={refused === null ? undefined : ''} title={refused === null ? undefined : `${text}: ${refused}`}>
      <span className="board-removable-chip-text">{text}</span>
      {refused === null ? null : <span className="board-removable-chip-refusal">{refused}</span>}
      <button
        type="button"
        className="board-removable-chip-remove"
        aria-label={removeLabel}
        title={keepReason ?? removeLabel}
        disabled={disabled || keepReason !== null}
        onClick={onRemove}
      >
        <span aria-hidden="true">×</span>
      </button>
    </span>
  );
}
