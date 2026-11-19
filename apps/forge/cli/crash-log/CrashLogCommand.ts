/**
 * `crash-log [<number>]`: prints one of the board's crash logs, the newest when no number is given. It reads the files alone, so it works
 * with the forge up or down, and takes no lock.
 */
import type { CrashLogJob, CrashLogRecord }    from '../../src/services/overseer/@types/CrashLogRecord.ts';
import type { StartClassificationVerdict }     from '../../src/services/overseer/@types/StartClassification.ts';
import { CrashLog }                            from '../../src/services/overseer/CrashLog.ts';
import { overseerFilesIn, type OverseerFiles } from '../../src/services/overseer/OverseerFiles.ts';
import { requireWorkspace }                    from '../../src/services/tracker/Workspace.ts';
import { OperationRefusal }                    from '../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                       from '../../src/shared/constants/ProductNames.ts';
import type { CommandHandler }                 from '../CommandHandler.ts';
import type { ArgumentParser }                 from '../arguments/ArgumentParser.ts';
import { OutputUtil }                          from '../utils/OutputUtil.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} crash-log [<number>] [--json]`;

const CRASH_LOG_NUMBER_PATTERN = /^[1-9]\d*$/;

const INDENT = '  ';

function requestedNumberOf(commandArguments: ArgumentParser): number | null {
  commandArguments.rejectUnknownOptions(['json'], USAGE);
  const written = commandArguments.positional();
  commandArguments.rejectExtraPositionals(written === undefined ? 0 : 1, USAGE);
  if (written === undefined) return null;
  if (!CRASH_LOG_NUMBER_PATTERN.test(written) || !Number.isSafeInteger(Number(written))) {
    throw new OperationRefusal('refused', `"${written}" is not a crash log number. Write a whole number from 1.\n  Usage: ${USAGE}`);
  }
  return Number(written);
}

function crashLogNumberToRead(files: OverseerFiles, requestedNumber: number | null): number {
  const crashLogNumber = requestedNumber ?? CrashLog.list(files).at(-1) ?? null;
  if (crashLogNumber === null) throw new OperationRefusal('refused', { kind: 'no-crash-log', number: null });
  return crashLogNumber;
}

function headingOf(crashLogNumber: number, path: string, record: CrashLogRecord): string {
  const recorder = record.recordedBy.crashPath ? 'the crash path' : `a start by ${record.recordedBy.startOrigin ?? 'an unknown origin'}`;
  const baton = record.crashedGeneration === null ? 'a Baton nothing names' : `Baton ${record.crashedGeneration}`;
  const suspectedText = record.suspected ? ', suspected before the machine restarted' : '';
  return `crash log ${crashLogNumber} (${path}), recorded ${record.recordedAt} by ${recorder}\n`
    + `component: ${record.component}, ${baton}${suspectedText}`;
}

function classificationLinesOf(classification: StartClassificationVerdict | null): string[] {
  if (classification === null) return ['classification: none, the crash path wrote it'];
  const { evidence } = classification;
  return [
    `classification: ${classification.kind}${classification.crashedComponent === null ? '' : ` (${classification.crashedComponent})`}`,
    `${INDENT}presence ${evidence.presence}, previous ending ${evidence.previousEnding ?? 'none'}, newer Baton than presence ${evidence.newerBatonThanPresence ? 'yes' : 'no'}`,
    `${INDENT}previous boot ${evidence.previousBootIdentity ?? 'unknown'}, current boot ${evidence.currentBootIdentity}, boot started ${evidence.bootStartedAt ?? 'unknown'}`,
    `${INDENT}Talos ${evidence.talos}, last beat ${evidence.lastHeartbeatAt ?? 'none'}`,
  ];
}

function errorLinesOf(error: CrashLogRecord['error']): string[] {
  if (error === null) return ['error: none recorded'];
  const stackLines = error.stack === null ? [] : error.stack.split('\n').map((line) => `${INDENT}${line}`);
  return [`error (${error.origin}): ${error.name}: ${error.message}`, ...stackLines];
}

function jobLineOf(job: CrashLogJob): string {
  const tickets = job.ticketIds.length === 0 ? '' : ` #${job.ticketIds.join(', #')}`;
  const interruption = job.interruption === null ? '' : `, interrupted ${job.interruption}`;
  const airlockPhase = job.airlockPhase === null ? '' : `, Airlock phase ${job.airlockPhase}`;
  return `${INDENT}${job.jobId} ${job.kind}${job.role === null ? '' : ` (${job.role})`}${tickets}: ${job.state}${interruption}${airlockPhase}, `
    + `instance ${job.instance}, event ${job.eventSequence}`;
}

function jobLinesOf(activeJobs: CrashLogRecord['activeJobs']): string[] {
  if (activeJobs === null) return ['jobs: the board could not be read'];
  if (activeJobs.length === 0) return ['jobs: none'];
  return ['jobs:', ...activeJobs.map(jobLineOf)];
}

function logTailLinesOf(logTail: CrashLogRecord['logTail']): string[] {
  if (logTail === null) return ['log tail: the log could not be read'];
  return [`log tail (${logTail.length} lines):`, ...logTail.map((line) => `${INDENT}${line}`)];
}

function crashLogTextOf(crashLogNumber: number, path: string, record: CrashLogRecord): string {
  return [
    headingOf(crashLogNumber, path, record),
    ...classificationLinesOf(record.classification),
    ...errorLinesOf(record.error),
    ...jobLinesOf(record.activeJobs),
    ...logTailLinesOf(record.logTail),
  ].join('\n');
}

export const crashLogCommand: CommandHandler = (commandArguments, context) => {
  const requestedNumber = requestedNumberOf(commandArguments);
  const files = overseerFilesIn(requireWorkspace(context.currentDirectory).trackerDirectory);
  const crashLogNumber = crashLogNumberToRead(files, requestedNumber);
  const path = CrashLog.pathOf(files, crashLogNumber);
  const reading = CrashLog.read(files, crashLogNumber);
  if (reading.verdict === 'absent') throw new OperationRefusal('refused', { kind: 'no-crash-log', number: crashLogNumber });
  if (reading.verdict === 'unreadable') throw new OperationRefusal('unrepaired', `Crash log ${crashLogNumber} (${path}) cannot be read: ${reading.reason}.`);
  OutputUtil.printEntity(commandArguments, context, { number: crashLogNumber, path, ...reading.record }, crashLogTextOf(crashLogNumber, path, reading.record));
  return Promise.resolve();
};
