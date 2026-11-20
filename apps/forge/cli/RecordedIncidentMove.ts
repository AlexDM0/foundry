/**
 * What the commands that record one control command share: a job id read as `J<n>`, an incident id read as `I<n>`, the optional
 * `--incident <I>`, and the command recorded in a hold (relayed when run under a job), printed as what it logged.
 */
import { ControlService }                      from '../src/services/control/ControlService.ts';
import type { ControlCommandOf }               from '../src/shared/@types/ControlCommand.ts';
import { OperationRefusal }                    from '../src/shared/OperationRefusal.ts';
import type { CommandContext }                 from './CommandContext.ts';
import { COMMAND_CONTROL_CONTEXT }             from './CommandControlContext.ts';
import { hatchWhenUnderJob }                   from './HatchUnderJob.ts';
import { openTrackerForWriting }               from './OpenTrackerForWriting.ts';
import type { ArgumentParser }                 from './arguments/ArgumentParser.ts';
import type { RelayedControlCommandKind }      from './constants/JobVerbs.ts';
import { INCIDENT_ID_PATTERN, JOB_ID_PATTERN } from './constants/RecordIdPatterns.ts';
import { OutputUtil }                          from './utils/OutputUtil.ts';

export function refuseUsage(problem: string, usage: string): never {
  throw new OperationRefusal('refused', `${problem}\n  Usage: ${usage}`);
}

export function jobIdOf(written: string | undefined, usage: string): string {
  if (written === undefined) refuseUsage('Name the job, as J4.', usage);
  const jobId = written.toUpperCase();
  if (!JOB_ID_PATTERN.test(jobId)) refuseUsage(`"${written}" is not a job id. Write J and its number, as J4.`, usage);
  return jobId;
}

export function incidentIdOf(written: string | undefined, usage: string): string {
  if (written === undefined) refuseUsage('Name the incident, as I4.', usage);
  const incidentId = written.toUpperCase();
  if (!INCIDENT_ID_PATTERN.test(incidentId)) refuseUsage(`"${written}" is not an incident id. Write I and its number, as I4.`, usage);
  return incidentId;
}

/** `--incident <I>` names the incident the move handles; without it the move takes its subject's one open incident that allows it. */
export function incidentOf(commandArguments: ArgumentParser, usage: string): { incidentId?: string } {
  const written = commandArguments.option('incident');
  return written === undefined ? {} : { incidentId: incidentIdOf(written, usage) };
}

function nothingToDoUnlessLogged(sentences: string): string {
  return sentences === '' ? 'Nothing to do.' : sentences;
}

export async function recordIncidentMove(
  commandArguments: ArgumentParser,
  context: CommandContext,
  command: ControlCommandOf<RelayedControlCommandKind>,
  printedTextOf: (loggedSentences: string) => string = nothingToDoUnlessLogged,
): Promise<void> {
  await hatchWhenUnderJob(context, command);
  const { logged } = await openTrackerForWriting(commandArguments, context, (change) => ControlService.apply(command, change, COMMAND_CONTROL_CONTEXT).result);
  OutputUtil.printEntity(commandArguments, context, { command, logged }, printedTextOf(OutputUtil.loggedSentencesOf(logged)));
}
