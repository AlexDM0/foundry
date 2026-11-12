/**
 * What the `pipeline` verbs share: the ids and the revision they read, and the one way they apply a setup command (relayed under a job)
 * and print the record it left.
 */
import type { PipelineBilling }          from '../../src/lib/tracker-model/@types/Pipeline.ts';
import { ControlService }                from '../../src/services/control/ControlService.ts';
import type { PipelineSetupCommandKind } from '../../src/services/control/PipelineSetupControls.ts';
import type { ControlCommandOf }         from '../../src/shared/@types/ControlCommand.ts';
import type { CommandContext }           from '../CommandContext.ts';
import { COMMAND_CONTROL_CONTEXT }       from '../CommandControlContext.ts';
import { hatchWhenUnderJob }             from '../HatchUnderJob.ts';
import { openTrackerForWriting }         from '../OpenTrackerForWriting.ts';
import { refuseUsage }                   from '../RecordedIncidentMove.ts';
import type { ArgumentParser }           from '../arguments/ArgumentParser.ts';
import { OutputUtil }                    from '../utils/OutputUtil.ts';

/** A setup, question and edit id as the Board writes them; a command line upper-cases what it reads first. */
const SETUP_ID_PATTERN    = /^S[1-9][0-9]*$/;
const QUESTION_ID_PATTERN = /^Q[1-9][0-9]*$/;
const EDIT_ID_PATTERN     = /^E[1-9][0-9]*$/;

const WHOLE_NUMBER_PATTERN = /^[0-9]+$/;

function recordIdOf(written: string | undefined, pattern: RegExp, example: string, usage: string): string {
  const recordId = written?.toUpperCase();
  if (recordId === undefined || !pattern.test(recordId)) refuseUsage(`Name the ${example}.`, usage);
  return recordId;
}

export function setupIdOf(written: string | undefined, usage: string): string {
  return recordIdOf(written, SETUP_ID_PATTERN, 'setup record, as S1', usage);
}

export function questionIdOf(written: string | undefined, usage: string): string {
  return recordIdOf(written, QUESTION_ID_PATTERN, 'setup question, as Q2', usage);
}

export function editIdOf(written: string | undefined, usage: string): string {
  return recordIdOf(written, EDIT_ID_PATTERN, 'draft edit, as E3', usage);
}

/** The revision User saw, which the Board compares, so an edit made on an older view is refused rather than written over a newer one. */
export function revisionFrom(commandArguments: ArgumentParser, usage: string): number {
  const written = commandArguments.option('revision');
  if (written === undefined || !WHOLE_NUMBER_PATTERN.test(written)) refuseUsage('Give the revision the edit starts from, as --revision 3.', usage);
  return Number(written);
}

/** `subscription`, or `api` with an optional cap; a cap that is no positive number is the Board's to refuse, with its reason. */
export function billingFrom(commandArguments: ArgumentParser, mode: string | undefined, usage: string): PipelineBilling {
  const cap = commandArguments.option('max-budget-usd');
  if (mode === 'subscription') {
    if (cap !== undefined) refuseUsage('--max-budget-usd goes only with api billing.', usage);
    return { mode };
  }
  if (mode !== 'api') refuseUsage('Name the billing: subscription or api.', usage);
  if (cap === undefined) return { mode };
  const maxBudgetUsd = Number(cap);
  if (cap.trim() === '' || !Number.isFinite(maxBudgetUsd)) refuseUsage(`"${cap}" is not a number of dollars.`, usage);
  return { mode, maxBudgetUsd };
}

/** Relays under a job; otherwise applies in a hold and prints the record as left, or under `--json` the record and the log lines. */
export async function applySetupCommand(commandArguments: ArgumentParser, context: CommandContext, command: ControlCommandOf<PipelineSetupCommandKind>): Promise<void> {
  await hatchWhenUnderJob(context, command);
  const changed = await openTrackerForWriting(
    commandArguments,
    context,
    (change) => ControlService.apply(command, change, COMMAND_CONTROL_CONTEXT).result,
  );
  OutputUtil.printEntity(commandArguments, context, { setup: changed.setup, logged: changed.logged }, OutputUtil.loggedSentencesOf(changed.logged));
}
