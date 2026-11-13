/**
 * A forge's refusal beside the control that caused it, in the error tone: the forge's code in mono and the sentence Gaia's server answered
 * for it, unedited here, then "Try again" when the command can be sent again, and a dismiss button. It is an alert, so it is read out when
 * it appears.
 */
import { Button } from './Button.tsx';

export interface RefusalProps {
  /** The refused command's own button label, such as "Stop". */
  readonly commandLabel: string;
  readonly code:         string;
  readonly sentence:     string;
  readonly onDismiss:    () => void;
  readonly onTryAgain?:  () => void;
}

export function Refusal({
  commandLabel, code, sentence, onDismiss, onTryAgain
}: RefusalProps) {
  return (
    <div className="gaia-refusal" role="alert">
      <span className="gaia-refusal-text">
        {`The forge refused ${commandLabel}: `}
        <span className="gaia-refusal-code">{code}</span>
        {`. ${sentence}`}
      </span>
      {onTryAgain === undefined ? null : <Button label="Try again" onPress={onTryAgain} />}
      <Button label="Dismiss this refusal" icon="dismiss" iconOnly onPress={onDismiss} />
    </div>
  );
}
