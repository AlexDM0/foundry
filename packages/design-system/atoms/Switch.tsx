/**
 * An on and off switch: a button of role `switch` whose `aria-checked` is its state, drawn as a track and a knob that slides by a transform,
 * so the move never changes the layout. A click, Space or Enter hands the toggle on, a held key once; a disabled switch hands nothing on.
 */
import type { KeyboardEvent } from 'react';

export interface SwitchProps {
  readonly accessibleName: string;
  readonly checked:        boolean;
  readonly onToggle:       () => void;
  readonly disabled?:      boolean;
  /** The id of a visible label, such as a node's title, that names the switch in place of `accessibleName`. */
  readonly labelledBy?:    string;
}

export function Switch({
  accessibleName, checked, onToggle, disabled = false, labelledBy
}: SwitchProps) {
  const toggleOnKey = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    // Toggled here, once, on the key's press, never on its auto-repeat; the default is stopped so the button's own click does not toggle
    // it a second time.
    event.preventDefault();
    if (!disabled && !event.repeat) onToggle();
  };

  return (
    <button
      className="design-system-switch"
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={labelledBy === undefined ? accessibleName : undefined}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={onToggle}
      onKeyDown={toggleOnKey}
    >
      <span className="design-system-switch-knob" />
    </button>
  );
}
