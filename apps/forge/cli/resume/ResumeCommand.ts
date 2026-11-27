/**
 * `resume`: User's resume of interrupted work, one job, one ticket, every waiting job, or every job that ended on a network outage. It
 * records one `interrupted-work-resume` in a hold, with the forge up or down, and the forge carries it out at its next pass.
 */
import { JOB_ID_PREFIX }                            from '../../src/domain/tracker-model/constants/JobStates.ts';
import type { ResumeTarget }                        from '../../src/shared/@types/ControlCommand.ts';
import { PRODUCT_NAMES }                            from '../../src/shared/constants/ProductNames.ts';
import type { CommandHandler }                      from '../CommandHandler.ts';
import { jobIdOf, recordIncidentMove, refuseUsage } from '../RecordedIncidentMove.ts';
import type { ArgumentParser }                      from '../arguments/ArgumentParser.ts';

const RESUME_USAGE = `${PRODUCT_NAMES.PROGRAM} resume <J>|<T> [--json] · ${PRODUCT_NAMES.PROGRAM} resume --all [--json] · `
  + `${PRODUCT_NAMES.PROGRAM} resume --network-outage [--json]`;

const RESUME_OPTION_NAMES = ['json', 'all', 'network-outage'];

const ONE_TARGET_PROBLEM = 'Name one job or ticket, or write --all or --network-outage, never two of them.';

const RECORDED_TEXT = `Recorded. The ${PRODUCT_NAMES.PROGRAM} carries it out at once when it is up, else when it starts.`;

const NOTHING_WAITS_TEXT = 'Nothing interrupted waits for a resume.';

function targetOfWritten(written: string): ResumeTarget {
  if (written.toUpperCase().startsWith(JOB_ID_PREFIX)) return { jobId: jobIdOf(written, RESUME_USAGE) };
  return { ticketReference: written };
}

/** Exactly one of a job or ticket, `--all` and `--network-outage`; a job id starts with `J`, anything else names a ticket. */
export function resumeTargetOf(commandArguments: ArgumentParser): ResumeTarget {
  commandArguments.rejectUnknownOptions(RESUME_OPTION_NAMES, RESUME_USAGE);
  const written       = commandArguments.positional();
  const resumesAll    = commandArguments.flag('all');
  const resumesOutage = commandArguments.flag('network-outage');
  const targetCount   = [written !== undefined, resumesAll, resumesOutage].filter(Boolean).length;
  if (targetCount !== 1) refuseUsage(ONE_TARGET_PROBLEM, RESUME_USAGE);
  commandArguments.rejectExtraPositionals(written === undefined ? 0 : 1, RESUME_USAGE);
  if (resumesAll) return 'all';
  if (resumesOutage) return 'network-outage';
  return targetOfWritten(written ?? '');
}

function printedTextOf(loggedSentences: string): string {
  return loggedSentences === '' ? NOTHING_WAITS_TEXT : `${loggedSentences}\n${RECORDED_TEXT}`;
}

export const resumeCommand: CommandHandler = async (commandArguments, context) => {
  const target = resumeTargetOf(commandArguments);
  await recordIncidentMove(commandArguments, context, { kind: 'interrupted-work-resume', target }, printedTextOf);
};
