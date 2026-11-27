/**
 * The answers of `GET /api/presence` and `GET /api/crash-log`, read fresh from the board's files at each request and mapped into the
 * contract's documents by `PresenceDocumentAssembly`.
 */
import { RefusalDocumentUtil }                             from '../../../src/adapters/utils/RefusalDocumentUtil.ts';
import type { PlatformPorts }                              from '../../../src/lib/platform-ports/PlatformPortsFor.ts';
import { readingBoardOf }                                  from '../../../src/lib/tracker-model/ReadingBoard.ts';
import { CrashLog }                                        from '../../../src/services/hephaestus/CrashLog.ts';
import type { HephaestusFiles }                            from '../../../src/services/hephaestus/HephaestusFiles.ts';
import type { RouteAnswer }                                from '../../../src/services/hephaestus/HephaestusServer.ts';
import { Presence }                                        from '../../../src/services/hephaestus/Presence.ts';
import { PresenceDocumentAssembly, type NumberedCrashLog } from '../../../src/services/hephaestus/PresenceDocumentAssembly.ts';
import { PresenceStatus }                                  from '../../../src/services/hephaestus/PresenceStatus.ts';
import type { UnreadableBoardFiles }                       from '../../../src/services/hephaestus/UnreadableBoardFiles.ts';
import type { StoreReadFace }                              from '../../../src/services/store/BoardStore.ts';
import type { Workspace }                                  from '../../../src/services/tracker/Workspace.ts';
import { OperationRefusal }                                from '../../../src/shared/OperationRefusal.ts';
import { LIFECYCLE_LIMITS }                                from '../../../src/shared/constants/LifecycleLimits.ts';

export interface PresenceSource {
  ports:                PlatformPorts;
  workspace:            Workspace;
  boardReads:           StoreReadFace;
  files:                HephaestusFiles;
  unreadableBoardFiles: UnreadableBoardFiles;
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

/**
 * Every crash log that can be read, oldest first; one that cannot is left out of the list, refused when asked for by its number, and
 * reported as the board header's warning.
 */
function readableCrashLogsOf(files: HephaestusFiles, unreadableBoardFiles: UnreadableBoardFiles): NumberedCrashLog[] {
  return CrashLog.list(files).flatMap((crashLogNumber) => {
    const reading = CrashLog.read(files, crashLogNumber);
    CrashLog.reportUnreadable(reading, crashLogNumber, unreadableBoardFiles);
    return reading.verdict === 'read' ? [{ crashLogNumber, record: reading.record }] : [];
  });
}

/** 503 `starting` until the serving generation wrote its presence with the classification its start gate handed in. */
function presenceAnswerOf(source: PresenceSource, servedGeneration: number | null): RouteAnswer {
  const {
    ports, workspace, boardReads, files, unreadableBoardFiles
  } = source;
  const presenceReading = Presence.readPresence(files);
  if (servedGeneration === null || presenceReading.verdict !== 'read' || presenceReading.record.generation !== servedGeneration) return STARTING_ANSWER;
  const { record } = presenceReading;
  const { startClassification } = record;
  if (startClassification === null) return STARTING_ANSWER;
  const {
    progress, listing, epicListing, draftListing, storedLog, pipelineReading
  } = boardReads.requireBoard();
  const pipeline = pipelineReading.verdict === 'readable' ? pipelineReading.pipeline : null;
  const heartbeatReading = Presence.readHeartbeat(files);
  const document = PresenceDocumentAssembly.presenceDocumentOf({
    presence:        { ...record, startClassification },
    heartbeat:       heartbeatReading.verdict === 'read' ? heartbeatReading.record : null,
    liveTalosRecord: PresenceStatus.liveTalosRecordOf(ports, workspace),
    board:           readingBoardOf(progress, listing.tickets, epicListing.epics, draftListing.drafts, storedLog.records, pipeline),
    limits:          LIFECYCLE_LIMITS,
    crashLogs:       readableCrashLogsOf(files, unreadableBoardFiles),
  });
  return { status: PRESENCE_STATUS.ANSWERED, body: document };
}

/** Served as every refusal is: its code, its fields and the sentence the command line prints. */
function noCrashLogAnswerOf(crashLogNumber: number | null): RouteAnswer {
  const { code, fields, sentence } = RefusalDocumentUtil.refusalDocumentOf(new OperationRefusal('refused', { kind: 'no-crash-log', number: crashLogNumber }));
  return { status: CRASH_LOG_STATUS.NO_CRASH_LOG, body: { refusal: code, fields, text: sentence } };
}

function writtenCrashLogNumberOf(writtenNumber: string): number | null {
  return CRASH_LOG_NUMBER_PATTERN.test(writtenNumber) && Number.isSafeInteger(Number(writtenNumber)) ? Number(writtenNumber) : null;
}

/** The newest log without a number; a number that is no whole number from 1 names no log. A log that cannot be read throws, so read-failed. */
function crashLogAnswerOf(files: HephaestusFiles, writtenNumber: string | null): RouteAnswer {
  const crashLogNumber = writtenNumber === null ? CrashLog.list(files).at(-1) ?? null : writtenCrashLogNumberOf(writtenNumber);
  if (crashLogNumber === null) return noCrashLogAnswerOf(null);
  const reading = CrashLog.read(files, crashLogNumber);
  if (reading.verdict === 'absent') return noCrashLogAnswerOf(crashLogNumber);
  if (reading.verdict === 'unreadable') throw new Error(`Crash log ${crashLogNumber} cannot be read: ${reading.reason}.`);
  return { status: CRASH_LOG_STATUS.ANSWERED, body: PresenceDocumentAssembly.crashLogDocumentOf(crashLogNumber, reading.record) };
}

export const PresenceReader = Object.freeze({ presenceAnswerOf, crashLogAnswerOf, readableCrashLogsOf });
