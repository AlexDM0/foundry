/**
 * What the `pipeline` verbs share: the ids and the revision they read, and the one way they apply a setup command (relayed under a job)
 * and print the record it left.
 */
import type { GateProfileCommandKind }   from '../../src/services/control/GateProfileControls.ts';
import type { PipelineAgentControlKind } from '../../src/services/control/PipelineAgentControls.ts';
import type { PipelineSetupCommandKind } from '../../src/services/control/PipelineSetupControls.ts';
import type { ControlCommandOf }         from '../../src/shared/@types/ControlCommand.ts';
import { applyCommandOfVerb }            from '../ApplyCommandOfVerb.ts';
import type { CommandContext }           from '../CommandContext.ts';
import { hatchWhenUnderJob }             from '../HatchUnderJob.ts';
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

/** Relays under a job; otherwise applies in a hold and prints the record as left, or under `--json` the record and the log lines. */
export async function applySetupCommand(
  commandArguments: ArgumentParser,
  context: CommandContext,
  command: ControlCommandOf<PipelineSetupCommandKind | PipelineAgentControlKind>,
): Promise<void> {
  await hatchWhenUnderJob(context, command);
  const changed = (await applyCommandOfVerb(commandArguments, context, command)).result;
  OutputUtil.printEntity(commandArguments, context, { setup: changed.setup, logged: changed.logged }, OutputUtil.loggedSentencesOf(changed.logged));
}

/** As `applySetupCommand`, for a gate profile: prints the run as left, and the run's state when the move logged nothing. */
export async function applyProfileCommand(
  commandArguments: ArgumentParser,
  context: CommandContext,
  command: ControlCommandOf<GateProfileCommandKind>,
): Promise<void> {
  await hatchWhenUnderJob(context, command);
  const changed = (await applyCommandOfVerb(commandArguments, context, command)).result;
  const { run, logged } = changed;
  const humanLine = logged.length > 0
    ? OutputUtil.loggedSentencesOf(logged)
    : `Gate profile ${run.profileRunId} is ${run.state}${run.stopRequested ? ', and its stop is asked for' : ''}.`;
  OutputUtil.printEntity(commandArguments, context, { run, logged }, humanLine);
}
