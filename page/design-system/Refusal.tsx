/**
 * A forge's refusal beside the control that caused it, as crimson text: the forge's code in mono and the sentence Gaia's server answered for
 * it, unedited here, then a compact "Try again" when the command can be sent again, and a named dismiss button. Never a red button. It is an
 * alert, so it is read out when it appears.
 */
import { Button }     from 'design-system/Button';
import { IconButton } from 'design-system/IconButton';

export interface RefusalProps {
  /** The refused command's own button label, such as "Stop". */
  readonly commandLabel: string;
  readonly code:         string;
  readonly sentence:     string;
  readonly onDismiss:    () => void;
  readonly onTryAgain?:  () => void;
}

const DISMISS_LABEL = 'Dismiss this refusal';

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
      {onTryAgain === undefined ? null : <Button label="Try again" compact onPress={onTryAgain} />}
      <IconButton glyph="close" accessibleName={DISMISS_LABEL} title={DISMISS_LABEL} onPress={onDismiss} />
    </div>
  );
}
