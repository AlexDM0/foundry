/**
 * After a call wrote a tracker, records it in the machine-wide monitor registry. A registry that cannot take the entry warns on standard
 * error and never changes the command's exit code.
 */
import { StoredFileProblemWording } from '../src/adapters/StoredFileProblemWording.ts';
import type { StoreReadFace }       from '../src/services/store/BoardStore.ts';
import {
  type MonitorRegistrationRequest,
  type ProgressRegistrationReading,
  type RegistryWriteFailure,
  registerWithTheMonitor
} from '../src/services/tracker/MonitorRegistration.ts';
import type { Workspace }            from '../src/services/tracker/Workspace.ts';
import { refusalIsOperationRefusal } from '../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }             from '../src/shared/constants/ProductNames.ts';
import { boardStoreIn }              from './BoardStoreOf.ts';
import type { CommandContext }       from './CommandContext.ts';
import { loggingLockTakerOf }        from './StaleLockWording.ts';

/** A board the store cannot read is still a verdict, never a throw: the registry only says it could not name the board. */
function progressRegistrationReadingOf(reads: StoreReadFace): ProgressRegistrationReading {
  try {
    const { trackerId, project } = reads.requireProgress();
    return { verdict: 'readable', trackerId, project };
  } catch (error) {
    if (!refusalIsOperationRefusal(error) || error.detail?.kind !== 'unreadable-tracker') throw error;
    const { reading } = error.detail;
    return reading.verdict === 'absent' ? { verdict: 'absent' } : { verdict: 'unreadable', tracker: reading };
  }
}

function registryWriteFailureTextOf(cause: RegistryWriteFailure): string {
  switch (cause.failure) {
    case 'registry-unreadable': return StoredFileProblemWording.sentenceOf(cause.problem);
    case 'lock-held':           return 'its lock is held by another process';
    case 'write-failed':        return cause.systemError;
  }
}

/** Everything the registry is told of a board but Hephaestus and its presence, read through the store. */
export function monitorRegistrationRequestOf(context: CommandContext, workspace: Workspace): MonitorRegistrationRequest {
  return {
    rootDirectory:        workspace.rootDirectory,
    progress:             progressRegistrationReadingOf(boardStoreIn(context, workspace).reads),
    monitorFolder:        context.platformPorts.dataFolders.monitorFolderOf(context.homeDirectory),
    temporaryDirectories: context.temporaryDirectories,
    command:              context.commandVerb,
    program:              context.programPath,
    now:                  context.now,
    lockTaker:            loggingLockTakerOf(context.platformPorts.processSupervision, context.standardError),
  };
}

export async function registerWrittenTracker(context: CommandContext, workspace: Workspace): Promise<void> {
  const outcome = await registerWithTheMonitor(monitorRegistrationRequestOf(context, workspace));
  if (outcome.verdict === 'registered-over-malformed') {
    context.standardError(
      `The monitor registry ${outcome.registryFilePath} was malformed (${outcome.problems.join('; ')}); it was rewritten keeping every readable entry.`,
    );
  } else if (outcome.verdict === 'not-registered-newer-version') {
    context.standardError(
      `The monitor registry ${outcome.registryFilePath} is version ${outcome.version}, newer than this ${PRODUCT_NAMES.PROGRAM} writes; it was left untouched.`,
    );
  } else if (outcome.verdict === 'not-registered-unwritable') {
    context.standardError(`The monitor registry ${outcome.registryFilePath} could not be updated: ${registryWriteFailureTextOf(outcome.cause)}`);
  }
}
