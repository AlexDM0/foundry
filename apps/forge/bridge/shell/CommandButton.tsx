/**
 * The one control that posts a `ControlCommand`: disabled whenever the shell says controls may not act, and showing the Overseer's
 * refusal verbatim beside itself, or that the Overseer could not be reached.
 */
import { Button } from 'design-system/Button';

import { useControlCommand, type SentCommands } from './ControlCommandSender.ts';

export interface CommandButtonProps {
  readonly label:                     string;
  /** `null` while a form behind the control is not complete: the control stays disabled. Several commands are sent in order. */
  readonly command:                   SentCommands | null;
  /** Restart and Stop: the Overseer answers them while launches are held for an install change. */
  readonly answeredWhileInstallHeld?: boolean;
  /** The view's own reason it has nothing to send, such as a benchmark that is still measuring. */
  readonly hasNothingToSend?:         boolean;
  /** Called with the command's result once the Overseer applied it, so a form can clear itself. */
  readonly onApplied?:                (result: unknown) => void;
  /** The one action a group leads with, ink on the page's ground, as a confirmation's. */
  readonly primary?:                  boolean;
  /** Draws the primary's band of light: the next step a view waits on. */
  readonly attention?:                boolean;
  /** The confirm of a move that ends or holds work, in the error colours. */
  readonly danger?:                   boolean;
  /** The button's name where its label is short for it, such as "low" under a "Priority" label. */
  readonly accessibleName?:           string;
  /** The 30px compact button of a row of small controls, such as the header's Overseer controls. */
  readonly compact?:                  boolean;
}

export function CommandButton({
  label, command, answeredWhileInstallHeld = false, hasNothingToSend = false, onApplied, primary = false, attention = false, danger = false,
  accessibleName, compact = false
}: CommandButtonProps) {
  const sender = useControlCommand(command, { answeredWhileInstallHeld, hasNothingToSend, ...(onApplied === undefined ? {} : { onApplied }) });
  return (
    <span className="bridge-control">
      <Button
        label={label}
        emphasis={danger ? 'danger' : (primary ? 'primary' : 'quiet')}
        attention={attention}
        compact={compact}
        disabled={!sender.enabled}
        onPress={() => void sender.send()}
        {...(accessibleName === undefined ? {} : { accessibleName })}
      />
      {sender.refusal === null ? null : <span className="bridge-refusal" role="status">{sender.refusal}</span>}
    </span>
  );
}
