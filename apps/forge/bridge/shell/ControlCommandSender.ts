/**
 * Sends one `ControlCommand` the way every Bridge control does: never while the shell says controls may not act, and with the Overseer's
 * refusal kept verbatim, the sentence that it could not be reached, or the sentence that its answer to a command it may have applied was lost,
 * for the caller to show beside its control. A control that acts on several jobs at once, such as Stop all, sends its commands in order and
 * stops at the first one the Overseer does not apply.
 */
import { useContext, useState } from 'react';

import type { CommandOutcome, ControlCommandBody }             from '../api/CommandClient.ts';
import { ControlAvailabilityUtil, ControlSurroundingsContext } from './ControlAvailability.ts';

export const UNREACHABLE_WORDING = 'The Overseer could not be reached. Try again.';
export const OUTCOME_UNKNOWN_WORDING = 'The Overseer may have applied this, but its answer was lost. Check the board before sending it again.';

export interface ControlCommandSender {
  readonly enabled: boolean;
  /** The refusal of the last send, `null` before one and after one the Overseer applied. */
  readonly refusal: string | null;
  readonly send:    () => Promise<void>;
}

export interface ControlCommandOptions {
  /** Restart and Stop: the Overseer answers them while launches are held for an install change. */
  readonly answeredWhileInstallHeld?: boolean;
  /** The caller's own reason it has nothing to send, such as a benchmark that is still measuring. */
  readonly hasNothingToSend?:         boolean;
  /** Called with the command's result once the Overseer applied it, so a form can clear itself or follow what the command made. */
  readonly onApplied?:                (result: unknown) => void;
}

/** What a control sends: one command, or several in order; an empty list leaves the sender disabled. */
export type SentCommands = ControlCommandBody | readonly ControlCommandBody[];

function isCommandList(command: SentCommands): command is readonly ControlCommandBody[] {
  return Array.isArray(command);
}

function commandsOf(command: SentCommands | null): readonly ControlCommandBody[] {
  if (command === null) return [];
  return isCommandList(command) ? command : [command];
}

/** `command` is `null` while the form behind it is not complete: the sender stays disabled. */
export function useControlCommand(command: SentCommands | null, options: ControlCommandOptions = {}): ControlCommandSender {
  const { answeredWhileInstallHeld = false, hasNothingToSend = false, onApplied } = options;
  const {
    availability, commandClient, onInstallHeld, onSessionLost, onRefused
  } = useContext(ControlSurroundingsContext);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const commands = commandsOf(command);
  const enabled = ControlAvailabilityUtil.controlIsEnabled(availability, answeredWhileInstallHeld) && !sending && !hasNothingToSend && commands.length > 0;

  const outcomeOfEvery = async (): Promise<CommandOutcome> => {
    let outcome: CommandOutcome = { verdict: 'unreachable' };
    for (const each of commands) {
      outcome = await commandClient.send(each);
      if (outcome.verdict !== 'applied') return outcome;
    }
    return outcome;
  };

  const send = async (): Promise<void> => {
    if (!enabled) return;
    setSending(true);
    setRefusal(null);
    const outcome = await outcomeOfEvery();
    setSending(false);
    if (outcome.verdict === 'applied') onApplied?.(outcome.result);
    if (outcome.verdict === 'refused') {
      setRefusal(outcome.refusal);
      onRefused?.(outcome.refusal);
    }
    if (outcome.verdict === 'unreachable') setRefusal(UNREACHABLE_WORDING);
    if (outcome.verdict === 'outcome-unknown') setRefusal(OUTCOME_UNKNOWN_WORDING);
    if (outcome.verdict === 'install-held') onInstallHeld(outcome.refusal);
    if (outcome.verdict === 'no-session') onSessionLost?.();
  };

  return { enabled, refusal, send };
}
