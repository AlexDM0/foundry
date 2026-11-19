/**
 * The routes the Overseer's API serves, over the board, its job folders, its picture store, Flint's brain and the framing programs' server
 * records: the state, summary, monitor snapshot, presence and crash logs read fresh each request, the brain's commands and the Bridge's
 * asks, the sentence of each refusal, a job's transcript and served files, a gate profile's output, the pictures User uploads and the ones
 * a transcript names, the origins allowed to frame the Bridge, and the Bridge itself, whose HTML import is the one place the command
 * surface reaches `bridge/`, by path, for Bun to bundle.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';

import bridgePage from '../../../bridge/index.html';

import { LogFileIngestion }                                   from '../../../src/adapters/log/LogFileIngestion.ts';
import { LogRecordMappingUtil }                               from '../../../src/adapters/log/utils/LogRecordMappingUtil.ts';
import { GateProfilesFile }                                   from '../../../src/adapters/pipeline/GateProfilesFile.ts';
import { RefusalDocumentUtil }                                from '../../../src/adapters/utils/RefusalDocumentUtil.ts';
import type { LogRecord }                                     from '../../../src/lib/tracker-model/@types/LogRecord.ts';
import { BoardDocumentAssembly }                              from '../../../src/services/overseer/BoardDocumentAssembly.ts';
import { BoardStateAssembly }                                 from '../../../src/services/overseer/BoardState.ts';
import type { EventBroker }                                   from '../../../src/services/overseer/EventBroker.ts';
import type { FlintBrain }                                    from '../../../src/services/overseer/FlintBrain.ts';
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
import { FlintBrainDigestUtil }                                                from '../../../src/services/overseer/utils/FlintBrainDigestUtil.ts';
import { PictureStore, type PictureStoring }                                   from '../../../src/services/tracker/PictureStore.ts';
import { OperationRefusal, type OperationRefusalDetail }                       from '../../../src/shared/OperationRefusal.ts';
import { ACCEPTED_PICTURE_MEDIA_TYPES, PICTURE_SIZE_LIMIT_BYTES }              from '../../../src/shared/constants/OverseerLimits.ts';
import { JOB_ID_PATTERN }                                                      from '../../constants/RecordIdPatterns.ts';
import { readBoardState, type BoardStateSource }                               from './BoardStateReader.ts';
import { MALFORMED_BODY_TEXT, answerControlCommand, type CommandRouteRequest } from './CommandRoute.ts';
import { FrameOrigins }                                                        from './FrameOrigins.ts';
import { PresenceReader }                                                      from './PresenceReader.ts';

export interface OverseerRouteRequest extends BoardStateSource, Omit<CommandRouteRequest, 'context' | 'flintBrain'> {
  flintBrain:    Pick<FlintBrain, 'start' | 'stop' | 'ask'>;
  token:         () => string | null;
  started:       () => boolean;
  broker:        () => EventBroker | null;
  monitorStream: () => MonitorStream | null;
  /** `null` until the Overseer took its generation. */
  monitorFacts:  () => MonitorOverseerFacts | null;
}

const SERVER_REFUSAL_TEXT: Readonly<Record<ServerRefusal, string>> = {
  'unauthorized':      'This needs the Overseer\'s token or a Bridge session. The Overseer may have restarted: open the board again.',
  'forbidden':         'The Overseer answers only its own page and programs on this machine that name it by 127.0.0.1 or localhost.',
  'read-failed':       'The Overseer could not read the board\'s files: one of them is missing or cannot be read.',
  'page-build-failed': 'The Overseer could not build the Bridge\'s page; its log names the cause.',
  'malformed-body':    MALFORMED_BODY_TEXT,
};

const FLINT_BRAIN_ASK_STATUS = {
  ANSWERED:  200,
  MALFORMED: 400,
} as const;

const MONITOR_STATUS = {
  ANSWERED: 200,
  STARTING: 503,
} as const;

/** No cursor, or empty text, starts at the first line; any text but a whole line number is no cursor. */
function profileOutputCursorOf(after: string | null): number | null {
  if (after === null || after === '') return 0;
  return /^\d+$/.test(after) ? Number(after) : null;
}

/** A run the board's `gate-profiles.json` holds now; an unreadable file holds none. */
function boardHoldsProfileRun(gateProfilesFilePath: string, profileRunId: string): boolean {
  const reading = GateProfilesFile.read(gateProfilesFilePath);
  return reading.verdict === 'readable' && reading.profiles.runs.some((run) => run.profileRunId === profileRunId);
}

/** An unreadable log names no sender, so every client line of the job reads as the Overseer's. */
function logRecordsIn(logFilePath: string): readonly LogRecord[] {
  const storedLog = LogRecordMappingUtil.storedLogOf(new LogFileIngestion(logFilePath).read());
  return storedLog.verdict === 'readable' ? storedLog.records : [];
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
  const presenceSource = { ports: context.platformPorts, workspace, files: overseerFilesIn(workspace.trackerDirectory) };
  const jobFolderOf = (jobId: string): string | null => {
    if (!JOB_ID_PATTERN.test(jobId)) return null;
    const jobFolder = request.boardChildren.jobFolderOf(jobId);
    return existsSync(jobFolder) ? jobFolder : null;
  };
  return {
    token:         request.token,
    started:       request.started,
    command:       (body, caller) => answerControlCommand(body, { ...request, context }, caller),
    askFlintBrain: async (body) => {
      const digest = FlintBrainDigestUtil.digestOf(body);
      if (digest === null) return { status: FLINT_BRAIN_ASK_STATUS.MALFORMED, body: { refusal: 'malformed-body', text: SERVER_REFUSAL_TEXT['malformed-body'] } };
      return { status: FLINT_BRAIN_ASK_STATUS.ANSWERED, body: await request.flintBrain.ask(digest) };
    },
    onNudge: request.wake,
    state:   () => readBoardState(request).state,
    board:   () => BoardDocumentAssembly.boardDocumentOf(readBoardState(request).state),
    summary: () => {
      const { state, project, readyTicketIds } = readBoardState(request);
      return BoardStateAssembly.summaryOf(state, project, readyTicketIds);
    },
    monitor: (): RouteAnswer => {
      const overseer = request.monitorFacts();
      if (overseer === null) return { status: MONITOR_STATUS.STARTING, body: { refusal: 'starting' } };
      return { status: MONITOR_STATUS.ANSWERED, body: MonitorSnapshotAssembly.monitorSnapshotOf({ ...readBoardState(request), overseer, now: context.now() }) };
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
          senderFactsOf: () => JobTranscript.senderFactsOf(logRecordsIn(workspace.logFilePath), workspace.trackerDirectory, jobId),
        });
        ({ cursor } = read);
        return read.entries;
      };
    },
    profileOutputOf: (profileRunId, after) => {
      const afterLineNumber = profileOutputCursorOf(after);
      if (afterLineNumber === null || !boardHoldsProfileRun(workspace.gateProfilesFilePath, profileRunId)) return null;
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
    picture:      (pictureId) => PictureStore.storedPictureOf(workspace.trackerDirectory, pictureId),
    frameOrigins: () => FrameOrigins.frameOriginsOf(context.platformPorts.dataFolders.monitorFolderOf(context.homeDirectory)),
    page:         bridgePage,
  };
}
