/**
 * Sends one board command the way every board control does: never while the board says controls may not act, and with the forge's
 * refusal kept verbatim, the sentence that it could not be reached, or the sentence that its answer to a command it may have applied was lost,
 * for the caller to show beside its control. A control that acts on several jobs at once, such as Stop all, sends its commands in order and
 * stops at the first one the forge does not apply.
 */
import { useContext, useState } from 'react';

import type { BoardCommandDocument }                           from '../../../@types/board/BoardCommandDocument.ts';
import type { BoardCommandResult, CommandOutcome }             from '../../api/BoardCommandClient.ts';
import type { ForgeRefusalFacts }                              from '../../api/RefusalOf.ts';
import { ControlAvailabilityUtil, ControlSurroundingsContext } from './ControlAvailability.ts';

export const UNREACHABLE_WORDING = 'Hephaestus could not be reached. Try again.';
export const OUTCOME_UNKNOWN_WORDING = 'Hephaestus may have applied this, but its answer was lost. Check the board before sending it again.';

export interface ControlCommandSender {
  readonly enabled:   boolean;
  /** The refusal of the last send, `null` before one and after one the forge applied. */
  readonly refusal:   string | null;
  /** Whether a send is on its way to the forge and its answer has not come yet. */
  readonly isSending: boolean;
  readonly send:      () => Promise<void>;
}

export interface ControlCommandOptions {
  /** Restart and Stop: the forge answers them while launches are held for an install change. */
  readonly answeredWhileInstallHeld?: boolean;
  /** The caller's own reason it has nothing to send, such as a benchmark that is still measuring. */
  readonly hasNothingToSend?:         boolean;
  /** Called with the command's result once the forge applied it, so a form can clear itself or follow what the command made. */
  readonly onApplied?:                (result: BoardCommandResult) => void;
}

/** What a control sends: one command, or several in order; an empty list leaves the sender disabled. */
export type SentCommands = BoardCommandDocument | readonly BoardCommandDocument[];

function isCommandList(command: SentCommands): command is readonly BoardCommandDocument[] {
  return Array.isArray(command);
}

function commandsOf(command: SentCommands | null): readonly BoardCommandDocument[] {
  if (command === null) return [];
  return isCommandList(command) ? command : [command];
}

export interface ControlCommandSequenceSender {
  /** Whether the board lets a control act now and no send is on its way. */
  readonly canSend:         boolean;
  /** Whether a send is on its way to the forge and its answer has not come yet. */
  readonly isSending:       boolean;
  readonly refusal:         string | null;
  /** The code and facts of the last send's refusal when the forge refused it, `null` otherwise. */
  readonly forgeRefusal:    ForgeRefusalFacts | null;
  /** The commands of the last send the forge applied, in order: every one, or those before the one it did not apply. */
  readonly appliedCommands: readonly BoardCommandDocument[];
  /** Sends the commands in order, stopping at the first one the forge does not apply; `true` once every one was applied. */
  readonly sendCommands:    (commands: readonly BoardCommandDocument[]) => Promise<boolean>;
}

/** A sender whose commands are named at the moment they are sent, such as a program's path chosen in the system's dialog. */
export function useControlCommandSequence(options: ControlCommandOptions = {}): ControlCommandSequenceSender {
  const { answeredWhileInstallHeld = false, onApplied } = options;
  const {
    availability, commandClient, onInstallHeld, onSessionLost, onRefused
  } = useContext(ControlSurroundingsContext);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [forgeRefusal, setForgeRefusal] = useState<ForgeRefusalFacts | null>(null);
  const [sending, setSending] = useState(false);
  const [appliedCommands, setAppliedCommands] = useState<readonly BoardCommandDocument[]>([]);
  const canSend = ControlAvailabilityUtil.controlIsEnabled(availability, answeredWhileInstallHeld) && !sending;

  const outcomeOfEvery = async (commands: readonly BoardCommandDocument[]): Promise<{ readonly outcome: CommandOutcome; readonly applied: BoardCommandDocument[] }> => {
    let outcome: CommandOutcome = { verdict: 'unreachable' };
    const applied: BoardCommandDocument[] = [];
    for (const each of commands) {
      outcome = await commandClient.send(each);
      if (outcome.verdict !== 'applied') return { outcome, applied };
      applied.push(each);
    }
    return { outcome, applied };
  };

  const sendCommands = async (commands: readonly BoardCommandDocument[]): Promise<boolean> => {
    if (!canSend || commands.length === 0) return false;
    setSending(true);
    setRefusal(null);
    setForgeRefusal(null);
    setAppliedCommands([]);
    const { outcome, applied } = await outcomeOfEvery(commands);
    setSending(false);
    setAppliedCommands(applied);
    if (outcome.verdict === 'applied') onApplied?.(outcome.result);
    if (outcome.verdict === 'refused') {
      setRefusal(outcome.refusal);
      setForgeRefusal(outcome.forgeRefusal ?? null);
      onRefused?.(outcome.refusal);
    }
    if (outcome.verdict === 'unreachable') setRefusal(UNREACHABLE_WORDING);
    if (outcome.verdict === 'outcome-unknown') setRefusal(OUTCOME_UNKNOWN_WORDING);
    if (outcome.verdict === 'install-held') onInstallHeld(outcome.refusal);
    if (outcome.verdict === 'no-session') onSessionLost?.();
    return outcome.verdict === 'applied';
  };

  return {
    canSend, isSending: sending, refusal, forgeRefusal, appliedCommands, sendCommands
  };
}

/** `command` is `null` while the form behind it is not complete: the sender stays disabled. */
export function useControlCommand(command: SentCommands | null, options: ControlCommandOptions = {}): ControlCommandSender {
  const { hasNothingToSend = false } = options;
  const sequence = useControlCommandSequence(options);
  const commands = commandsOf(command);
  const enabled = sequence.canSend && !hasNothingToSend && commands.length > 0;
  const send = async (): Promise<void> => {
    if (enabled) await sequence.sendCommands(commands);
  };
  return {
    enabled, refusal: sequence.refusal, isSending: sequence.isSending, send
  };
}
