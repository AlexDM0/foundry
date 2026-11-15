/**
 * The refusal of the last send about one subject, beside the control that sent it, until dismissed or until the next command about that
 * subject succeeds: the forge's code and sentence, or Gaia's when nothing answered for it. Nothing shows while the subject has no failure.
 */
import { CommandSender, type CommandStates, type CommandSubject } from '../api/CommandSender.ts';
import { Refusal }                                                from '../design-system/Refusal.tsx';
import { CommandFailureTextUtil }                                 from './utils/CommandFailureTextUtil.ts';

export interface CommandFailureRefusalProps {
  readonly commandStates:    CommandStates;
  readonly subject:          CommandSubject;
  /** The button that sent the command, such as "Look again". */
  readonly commandLabel:     string;
  readonly onDismissFailure: (subject: CommandSubject) => void;
  /** Sends the command once more; without it the refusal offers only its dismissal. */
  readonly onTryAgain?:      () => void;
}

export function CommandFailureRefusal({
  commandStates, subject, commandLabel, onDismissFailure, onTryAgain
}: CommandFailureRefusalProps) {
  const { failure } = CommandSender.stateOf(commandStates, subject);
  if (failure === null) return null;
  const { refusedBy, code, sentence } = CommandFailureTextUtil.refusalTextOf(failure);
  return (
    <Refusal
      commandLabel={commandLabel}
      refusedBy={refusedBy}
      code={code}
      sentence={sentence}
      onDismiss={() => onDismissFailure(subject)}
      {...(onTryAgain === undefined ? {} : { onTryAgain })}
    />
  );
}
