/**
 * The routes the Overseer's API serves, over the board, its job folders and its picture store: the state, summary, monitor snapshot,
 * presence and crash logs read fresh each request, the commands, the sentence of each refusal, a job's transcript and served files, a gate
 * profile's output, and the pictures User uploads and the ones a transcript names. The Overseer serves no page.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { RefusalDocumentUtil }                                from '../../../src/adapters/utils/RefusalDocumentUtil.ts';
import type { LogRecord }                                     from '../../../src/lib/tracker-model/@types/LogRecord.ts';
import { BoardDocumentAssembly }                              from '../../../src/services/overseer/BoardDocumentAssembly.ts';
import { BoardStateAssembly }                                 from '../../../src/services/overseer/BoardState.ts';
import type { EventBroker }                                   from '../../../src/services/overseer/EventBroker.ts';
import { GateProfiling }                                      from '../../../src/services/overseer/GateProfiling.ts';
import { JobTranscript }                                      from '../../../src/services/overseer/JobTranscript.ts';
import { MonitorSnapshotAssembly, type MonitorOverseerFacts } from '../../../src/services/overseer/MonitorSnapshotAssembly.ts';
import type { MonitorStream }                                 from '../../../src/services/overseer/MonitorStream.ts';
import { overseerFilesIn }                                    from '../../../src/services/overseer/OverseerFiles.ts';
import type {
  OverseerRoutes,
  RouteAnswer,
  ServerRefusal,
  TranscriptFollower
} from '../../../src/services/overseer/OverseerServer.ts';
import type { StoreReadFace }                                                  from '../../../src/services/store/BoardStore.ts';
import { PictureStore, type PictureStoring }                                   from '../../../src/services/tracker/PictureStore.ts';
import { OperationRefusal, type OperationRefusalDetail }                       from '../../../src/shared/OperationRefusal.ts';
import { ACCEPTED_PICTURE_MEDIA_TYPES, PICTURE_SIZE_LIMIT_BYTES }              from '../../../src/shared/constants/OverseerLimits.ts';
import { JOB_ID_PATTERN }                                                      from '../../constants/RecordIdPatterns.ts';
import { readBoardState, type BoardStateSource }                               from './BoardStateReader.ts';
import { MALFORMED_BODY_TEXT, answerControlCommand, type CommandRouteRequest } from './CommandRoute.ts';
import { PresenceReader }                                                      from './PresenceReader.ts';

export interface OverseerRouteRequest extends Omit<BoardStateSource, 'boardReads'>, Omit<CommandRouteRequest, 'context'> {
  token:         () => string | null;
  started:       () => boolean;
  broker:        () => EventBroker | null;
  monitorStream: () => MonitorStream | null;
  /** `null` until the Overseer took its generation. */
  monitorFacts:  () => MonitorOverseerFacts | null;
}

const SERVER_REFUSAL_TEXT: Readonly<Record<ServerRefusal, string>> = {
  'unauthorized':   'This needs the Overseer\'s token. The Overseer may have restarted, and a restart makes a new token.',
  'forbidden':      'The Overseer answers only programs on this machine that name it by 127.0.0.1 or localhost.',
  'read-failed':    'The Overseer could not read the board\'s files: one of them is missing or cannot be read.',
  'malformed-body': MALFORMED_BODY_TEXT,
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

/** An unreadable log names no sender, so every client line of the job reads as the Overseer's. */
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

export function overseerRoutesOf(request: OverseerRouteRequest): OverseerRoutes {
  const { context, workspace } = request;
  const boardReads = request.boardStore.reads;
  const boardStateSource: BoardStateSource = { ...request, boardReads };
  const presenceSource = {
    ports: context.platformPorts, workspace, boardReads, files: overseerFilesIn(workspace.trackerDirectory)
  };
  const jobFolderOf = (jobId: string): string | null => {
    if (!JOB_ID_PATTERN.test(jobId)) return null;
    const jobFolder = request.boardChildren.jobFolderOf(jobId);
    return existsSync(jobFolder) ? jobFolder : null;
  };
  return {
    token:   request.token,
    started: request.started,
    command: (body) => answerControlCommand(body, { ...request, context }),
    onNudge: request.wake,
    state:   () => readBoardState(boardStateSource).state,
    board:   () => BoardDocumentAssembly.boardDocumentOf({ ...readBoardState(boardStateSource), now: context.now() }),
    summary: () => {
      const { state, project, readyTicketIds } = readBoardState(boardStateSource);
      return BoardStateAssembly.summaryOf(state, project, readyTicketIds);
    },
    monitor: (): RouteAnswer => {
      const overseer = request.monitorFacts();
      if (overseer === null) return { status: MONITOR_STATUS.STARTING, body: { refusal: 'starting' } };
      return { status: MONITOR_STATUS.ANSWERED, body: MonitorSnapshotAssembly.monitorSnapshotOf({ ...readBoardState(boardStateSource), overseer, now: context.now() }) };
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
      return GateProfiling.outputFollowerOf(workspace.trackerDirectory, profileRunId, afterLineNumber);
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
