/**
 * The routes Hephaestus's API serves, over the board, its job folders and its picture store: the state, summary, monitor snapshot,
 * presence and crash logs read fresh each request, the commands, the sentence of each refusal, a job's transcript and served files, a gate
 * profile's output, and the pictures User uploads and the ones a transcript names. Hephaestus serves no page.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { RefusalDocumentUtil }   from '../../../src/adapters/utils/RefusalDocumentUtil.ts';
import type { LogRecord }        from '../../../src/domain/tracker-model/@types/LogRecord.ts';
import { BoardDocumentAssembly } from '../../../src/services/hephaestus/BoardDocumentAssembly.ts';
import { BoardStateAssembly }    from '../../../src/services/hephaestus/BoardState.ts';
import type { EventBroker }      from '../../../src/services/hephaestus/EventBroker.ts';
import { GateProfiling }         from '../../../src/services/hephaestus/GateProfiling.ts';
import { hephaestusFilesIn }     from '../../../src/services/hephaestus/HephaestusFiles.ts';
import type {
  HephaestusRoutes,
  RouteAnswer,
  ServerRefusal,
  TranscriptFollower
} from '../../../src/services/hephaestus/HephaestusServer.ts';
import { JobTranscript }                                                       from '../../../src/services/hephaestus/JobTranscript.ts';
import { MonitorSnapshotAssembly, type MonitorHephaestusFacts }                from '../../../src/services/hephaestus/MonitorSnapshotAssembly.ts';
import type { MonitorStream }                                                  from '../../../src/services/hephaestus/MonitorStream.ts';
import { TicketDocumentsAssembly, type ConstitutionNumbers }                   from '../../../src/services/hephaestus/TicketDocumentsAssembly.ts';
import type { UnreadableBoardFiles }                                           from '../../../src/services/hephaestus/UnreadableBoardFiles.ts';
import type { StoreReadFace }                                                  from '../../../src/services/store/BoardStore.ts';
import { readingBoardOfContents }                                              from '../../../src/services/tracker/BoardOfContents.ts';
import { PictureStore, type PictureStoring }                                   from '../../../src/services/tracker/PictureStore.ts';
import type { EffectReadingSource }                                            from '../../../src/shared/@types/EffectReading.ts';
import { OperationRefusal, type OperationRefusalDetail }                       from '../../../src/shared/OperationRefusal.ts';
import { ACCEPTED_PICTURE_MEDIA_TYPES, PICTURE_SIZE_LIMIT_BYTES }              from '../../../src/shared/constants/HephaestusLimits.ts';
import { JOB_ID_PATTERN }                                                      from '../../constants/RecordIdPatterns.ts';
import { readBoardState, type BoardStateSource }                               from './BoardStateReader.ts';
import { MALFORMED_BODY_TEXT, answerControlCommand, type CommandRouteRequest } from './CommandRoute.ts';
import { PresenceReader }                                                      from './PresenceReader.ts';

export interface HephaestusRouteRequest extends Omit<BoardStateSource, 'boardReads'>, Omit<CommandRouteRequest, 'context'> {
  token:                () => string | null;
  started:              () => boolean;
  broker:               () => EventBroker | null;
  monitorStream:        () => MonitorStream | null;
  /** `null` until Hephaestus took its generation. */
  monitorFacts:         () => MonitorHephaestusFacts | null;
  /** Hephaestus's log, for what a route skips while it reads. */
  log:                  (line: string) => void;
  /** The board header's warnings, for a board-wide file a route finds unreadable. */
  unreadableBoardFiles: UnreadableBoardFiles;
}

const SERVER_REFUSAL_TEXT: Readonly<Record<ServerRefusal, string>> = {
  'unauthorized':   'This needs Hephaestus\'s token. Hephaestus may have restarted, and a restart makes a new token.',
  'forbidden':      'Hephaestus answers only programs on this machine that name it by 127.0.0.1 or localhost.',
  'read-failed':    'Hephaestus could not read the board\'s files: one of them is missing or cannot be read.',
  'malformed-body': MALFORMED_BODY_TEXT,
  'body-too-large': 'The command body is larger than Hephaestus reads, so nothing was done.',
};

const MONITOR_STATUS = {
  ANSWERED: 200,
  STARTING: 503,
} as const;

/** No cursor, or empty text, starts at the first line; any text but a whole line number is no cursor. */
function profileOutputCursorOf(after: string | null): number | null {
  if (after === null || after === '') return 0;
  return /^\d+$/.test(after) ? Number(after) : null;
}

/** A run the board's gate profiles hold now; unreadable gate profiles hold none. */
function boardHoldsProfileRun(boardReads: StoreReadFace, profileRunId: string): boolean {
  const reading = boardReads.readGateProfiles();
  return reading.verdict === 'readable' && reading.profiles.runs.some((run) => run.profileRunId === profileRunId);
}

/** An unreadable log names no sender, so every client line of the job reads as Hephaestus's. */
function logRecordsOf(boardReads: StoreReadFace): readonly LogRecord[] {
  const reading = boardReads.readLogRecords();
  return reading.verdict === 'readable' ? reading.records : [];
}

const PICTURE_STATUS = {
  STORED:           200,
  TOO_LARGE:        413,
  TYPE_UNSUPPORTED: 415,
} as const;

function pictureRefusalOf(status: number, detail: OperationRefusalDetail): RouteAnswer {
  const { code, fields, sentence } = RefusalDocumentUtil.refusalDocumentOf(new OperationRefusal('refused', detail));
  return { status, body: { refusal: code, fields, text: sentence } };
}

/** `POST /api/pictures`: the picture stored owner-only by its hash, or its refusal as its code, its fields and the command line's sentence. */
function pictureUploadAnswerOf(storing: PictureStoring): RouteAnswer {
  if (storing.verdict === 'too-large') {
    return pictureRefusalOf(PICTURE_STATUS.TOO_LARGE, { kind: 'picture-too-large', bytes: storing.bytes, sizeLimitBytes: PICTURE_SIZE_LIMIT_BYTES });
  }
  if (storing.verdict === 'type-unsupported') {
    return pictureRefusalOf(PICTURE_STATUS.TYPE_UNSUPPORTED, { kind: 'picture-type-unsupported', mediaTypes: ACCEPTED_PICTURE_MEDIA_TYPES });
  }
  return { status: PICTURE_STATUS.STORED, body: { pictureId: storing.pictureId, bytes: storing.bytes, mediaType: storing.mediaType } };
}

const TICKET_DOCUMENTS_STATUS = {
  ANSWERED:     200,
  NO_DOCUMENTS: 404,
} as const;

/** What a ticket's documents are read from beside the board: the effect readings and the constitution numbers counted so far. */
interface TicketDocumentsReads {
  effectReadings:      () => EffectReadingSource | null;
  constitutionNumbers: ConstitutionNumbers;
}

/**
 * `GET /api/tickets/<ticket>/documents`: the document, or 404 worded for a reference that names no ticket, a ticket with no documents, or
 * one whose documents record cannot be read, which is named as unreadable, never as absent.
 */
function ticketDocumentsAnswerOf(boardReads: StoreReadFace, reads: TicketDocumentsReads, ticketReference: string): RouteAnswer {
  const contents = boardReads.requireBoard();
  const board    = readingBoardOfContents(contents);
  const ticket   = board.ticketByReference(ticketReference);
  try {
    if (ticket === undefined) throw new OperationRefusal('refused', { kind: 'no-readable-ticket', reference: ticketReference });
    const ticketId = ticket.frontmatter.id;
    const unreadableRecord = contents.ticketDocumentListing.unreadable.find((unreadable) => unreadable.key === ticketId);
    if (unreadableRecord !== undefined) {
      throw new OperationRefusal('refused', { kind: 'unreadable-file-in-the-way', filePath: unreadableRecord.location, record: 'ticket-documents' });
    }
    const document = TicketDocumentsAssembly.ticketDocumentsOf({
      ticket,
      loadedRecord:        board.ticketDocumentRecordOf(ticketId),
      pipeline:            board.pipeline(),
      jobs:                board.jobs(),
      effectReadings:      reads.effectReadings()?.readingsOf(ticketId) ?? [],
      constitutionNumbers: reads.constitutionNumbers,
    });
    return { status: TICKET_DOCUMENTS_STATUS.ANSWERED, body: document };
  } catch (thrown) {
    if (!(thrown instanceof OperationRefusal)) throw thrown;
    const { code, fields, sentence } = RefusalDocumentUtil.refusalDocumentOf(thrown);
    return { status: TICKET_DOCUMENTS_STATUS.NO_DOCUMENTS, body: { refusal: code, fields, text: sentence } };
  }
}

export function hephaestusRoutesOf(request: HephaestusRouteRequest): HephaestusRoutes {
  const { context, workspace } = request;
  const boardReads = request.boardStore.reads;
  const boardStateSource: BoardStateSource = { ...request, boardReads };
  const presenceSource = {
    ports: context.platformPorts, workspace, boardReads, files: hephaestusFilesIn(workspace.trackerDirectory), unreadableBoardFiles: request.unreadableBoardFiles
  };
  const ticketDocumentsReads: TicketDocumentsReads = {
    effectReadings:      () => request.effectReadings?.() ?? null,
    constitutionNumbers: TicketDocumentsAssembly.constitutionNumbersIn(workspace.rootDirectory),
  };
  const jobFolderOf = (jobId: string): string | null => {
    if (!JOB_ID_PATTERN.test(jobId)) return null;
    const jobFolder = request.boardChildren.jobFolderOf(jobId);
    return existsSync(jobFolder) ? jobFolder : null;
  };
  return {
    token:           request.token,
    started:         request.started,
    command:         (body) => answerControlCommand(body, { ...request, context }),
    ticketDocuments: (ticketReference) => ticketDocumentsAnswerOf(boardReads, ticketDocumentsReads, ticketReference),
    onNudge:         request.wake,
    state:           () => readBoardState(boardStateSource).state,
    board:           () => BoardDocumentAssembly.boardDocumentOf({ ...readBoardState(boardStateSource), now: context.now() }),
    summary:         () => {
      const { state, project, readyTicketIds } = readBoardState(boardStateSource);
      return BoardStateAssembly.summaryOf(state, project, readyTicketIds);
    },
    monitor: (): RouteAnswer => {
      const hephaestus = request.monitorFacts();
      if (hephaestus === null) return { status: MONITOR_STATUS.STARTING, body: { refusal: 'starting' } };
      return { status: MONITOR_STATUS.ANSWERED, body: MonitorSnapshotAssembly.monitorSnapshotOf({ ...readBoardState(boardStateSource), hephaestus, now: context.now() }) };
    },
    presence:      () => PresenceReader.presenceAnswerOf(presenceSource, request.monitorFacts()?.generation ?? null),
    crashLog:      (writtenNumber) => PresenceReader.crashLogAnswerOf(presenceSource.files, writtenNumber),
    monitorStream: request.monitorStream,
    refusalTextOf: (refusal) => SERVER_REFUSAL_TEXT[refusal],
    events:        request.broker,
    transcriptOf:  (jobId, after): TranscriptFollower | null => {
      const jobFolder = jobFolderOf(jobId);
      const startCursor = JobTranscript.cursorOf(after);
      if (jobFolder === null || startCursor === null) return null;
      let cursor = startCursor;
      return () => {
        const read = JobTranscript.entriesAfter(jobFolder, request.boardChildren.newestInstanceIn(jobFolder) ?? 0, cursor, {
          eventsAfter:   request.boardChildren.eventsAfter,
          eventsOf:      (line) => context.agentAdapter.eventsOf(line),
          sentLineOf:    (line) => context.agentAdapter.sentLineOf(line),
          senderFactsOf: () => JobTranscript.senderFactsOf(logRecordsOf(boardReads), workspace.trackerDirectory, jobId),
        });
        ({ cursor } = read);
        return read.entries;
      };
    },
    profileOutputOf: (profileRunId, after) => {
      const afterLineNumber = profileOutputCursorOf(after);
      if (afterLineNumber === null || !boardHoldsProfileRun(boardReads, profileRunId)) return null;
      return GateProfiling.outputFollowerOf(workspace.trackerDirectory, profileRunId, afterLineNumber, request.log);
    },
    jobFileText: (jobId, fileName) => {
      const jobFolder = jobFolderOf(jobId);
      if (jobFolder === null) return null;
      try {
        return readFileSync(join(jobFolder, fileName), 'utf8');
      } catch {
        return null;
      }
    },
    storePicture: (upload) => pictureUploadAnswerOf(upload.verdict === 'over-limit'
      ? { verdict: 'too-large', bytes: upload.bytes }
      : PictureStore.storePicture(context.platformPorts.ownerOnlyFiles, workspace.trackerDirectory, upload.bytes)),
    picture: (pictureId) => PictureStore.storedPictureOf(workspace.trackerDirectory, pictureId),
  };
}
