/**
 * The Send of a message box: an orange square holding a paper plane, as tall as the text box beside it. Its words are only its
 * accessible name, so a refusal is shown by its caller.
 */
import { Icon } from '../../lib/design-system/DesignSystemInterface.ts';

export interface SendButtonProps {
  readonly accessibleName: string;
  readonly enabled:        boolean;
  readonly onPress:        () => void;
}

export function SendButton({ accessibleName, enabled, onPress }: SendButtonProps) {
  return (
    <button type="button" className="board-send-button" aria-label={accessibleName} disabled={!enabled} onClick={onPress}>
      <span className="board-send-icon"><Icon name="paper-plane" label={null} /></span>
    </button>
  );
}
