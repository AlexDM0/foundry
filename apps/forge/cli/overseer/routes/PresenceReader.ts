/**
 * The answers of `GET /api/presence` and `GET /api/crash-log`, read fresh from the board's files at each request and mapped into the
 * contract's documents by `PresenceDocumentAssembly`.
 */
import { OperationRefusalWordingUtil }                     from '../../../src/adapters/utils/OperationRefusalWordingUtil.ts';
import type { PlatformPorts }                              from '../../../src/lib/platform-ports/PlatformPortsFor.ts';
import { readingBoardOf }                                  from '../../../src/lib/tracker-model/ReadingBoard.ts';
import { CrashLog }                                        from '../../../src/services/overseer/CrashLog.ts';
import type { OverseerFiles }                              from '../../../src/services/overseer/OverseerFiles.ts';
import type { RouteAnswer }                                from '../../../src/services/overseer/OverseerServer.ts';
import { Presence }                                        from '../../../src/services/overseer/Presence.ts';
import { PresenceDocumentAssembly, type NumberedCrashLog } from '../../../src/services/overseer/PresenceDocumentAssembly.ts';
import { PresenceStatus }                                  from '../../../src/services/overseer/PresenceStatus.ts';
import { requireTracker }                                  from '../../../src/services/tracker/TrackerReader.ts';
import type { Workspace }                                  from '../../../src/services/tracker/Workspace.ts';
import { OperationRefusal }                                from '../../../src/shared/OperationRefusal.ts';
import { LIFECYCLE_LIMITS }                                from '../../../src/shared/constants/LifecycleLimits.ts';

export interface PresenceSource {
  ports:     PlatformPorts;
  workspace: Workspace;
  files:     OverseerFiles;
}

const PRESENCE_STATUS = {
  ANSWERED: 200,
  STARTING: 503,
} as const;

const CRASH_LOG_STATUS = {
  ANSWERED:     200,
  NO_CRASH_LOG: 404,
} as const;

const CRASH_LOG_NUMBER_PATTERN = /^[1-9]\d*$/;

const STARTING_ANSWER: RouteAnswer = { status: PRESENCE_STATUS.STARTING, body: { refusal: 'starting' } };

/** Every crash log that can be read, oldest first; one that cannot is left out of the list and refused when asked for by its number. */
function readableCrashLogsOf(files: OverseerFiles): NumberedCrashLog[] {
  return CrashLog.list(files).flatMap((crashLogNumber) => {
    const reading = CrashLog.read(files, crashLogNumber);
    return reading.verdict === 'read' ? [{ crashLogNumber, record: reading.record }] : [];
  });
}

/** 503 `starting` until the serving generation wrote its presence with the classification its start gate handed in. */
function presenceAnswerOf(source: PresenceSource, servedGeneration: number | null): RouteAnswer {
  const { ports, workspace, files } = source;
  const presenceReading = Presence.readPresence(files);
  if (servedGeneration === null || presenceReading.verdict !== 'read' || presenceReading.record.generation !== servedGeneration) return STARTING_ANSWER;
  const { record } = presenceReading;
  const { startClassification } = record;
  if (startClassification === null) return STARTING_ANSWER;
  const {
    progress, listing, epicListing, draftListing, storedLog, pipelineReading
  } = requireTracker(workspace);
  const pipeline = pipelineReading.verdict === 'readable' ? pipelineReading.pipeline : null;
  const heartbeatReading = Presence.readHeartbeat(files);
  const document = PresenceDocumentAssembly.presenceDocumentOf({
    presence:        { ...record, startClassification },
    heartbeat:       heartbeatReading.verdict === 'read' ? heartbeatReading.record : null,
    liveTalosRecord: PresenceStatus.liveTalosRecordOf(ports, workspace),
    board:           readingBoardOf(progress, listing.tickets, epicListing.epics, draftListing.drafts, storedLog.records, pipeline),
    limits:          LIFECYCLE_LIMITS,
    crashLogs:       readableCrashLogsOf(files),
  });
  return { status: PRESENCE_STATUS.ANSWERED, body: document };
}

function noCrashLogAnswerOf(crashLogNumber: number | null): RouteAnswer {
  const refusal = new OperationRefusal('refused', { kind: 'no-crash-log', number: crashLogNumber });
  return {
    status: CRASH_LOG_STATUS.NO_CRASH_LOG,
    body:   { refusal: 'no-crash-log', number: crashLogNumber, text: OperationRefusalWordingUtil.apiMessageOf(refusal) },
  };
}

function writtenCrashLogNumberOf(writtenNumber: string): number | null {
  return CRASH_LOG_NUMBER_PATTERN.test(writtenNumber) && Number.isSafeInteger(Number(writtenNumber)) ? Number(writtenNumber) : null;
}

/** The newest log without a number; a number that is no whole number from 1 names no log. A log that cannot be read throws, so read-failed. */
function crashLogAnswerOf(files: OverseerFiles, writtenNumber: string | null): RouteAnswer {
  const crashLogNumber = writtenNumber === null ? CrashLog.list(files).at(-1) ?? null : writtenCrashLogNumberOf(writtenNumber);
  if (crashLogNumber === null) return noCrashLogAnswerOf(null);
  const reading = CrashLog.read(files, crashLogNumber);
  if (reading.verdict === 'absent') return noCrashLogAnswerOf(crashLogNumber);
  if (reading.verdict === 'unreadable') throw new Error(`Crash log ${crashLogNumber} cannot be read: ${reading.reason}.`);
  return { status: CRASH_LOG_STATUS.ANSWERED, body: PresenceDocumentAssembly.crashLogDocumentOf(crashLogNumber, reading.record) };
}

export const PresenceReader = Object.freeze({ presenceAnswerOf, crashLogAnswerOf });
