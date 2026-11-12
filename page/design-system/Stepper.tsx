/**
 * Two 24 px buttons around a mono value, for a limit. Each button's accessible name says what it changes ("Raise this forge's agent
 * limit"), and each side is disabled on its own, so a limit at its ceiling can still be lowered.
 */
export interface StepperProps {
  readonly value:          string;
  readonly lowerLabel:     string;
  readonly raiseLabel:     string;
  readonly onLower:        () => void;
  readonly onRaise:        () => void;
  readonly lowerDisabled?: boolean;
  readonly raiseDisabled?: boolean;
  /** `figure` sets the value at 18 px, as the machine limit is. */
  readonly valueSize?:     'body' | 'figure';
}

export function Stepper({
  value, lowerLabel, raiseLabel, onLower, onRaise, lowerDisabled = false, raiseDisabled = false, valueSize = 'body'
}: StepperProps) {
  return (
    <span className="gaia-stepper">
      <button type="button" className="gaia-stepper-button" aria-label={lowerLabel} title={lowerLabel} disabled={lowerDisabled} onClick={onLower}>−</button>
      <span className="gaia-stepper-value" data-size={valueSize}>{value}</span>
      <button type="button" className="gaia-stepper-button" aria-label={raiseLabel} title={raiseLabel} disabled={raiseDisabled} onClick={onRaise}>+</button>
    </span>
  );
}
