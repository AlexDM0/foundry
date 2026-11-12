/**
 * The routes the Overseer's API serves, over the board, its job folders, its picture store and agent-dashboard's server record: the state,
 * summary and monitor snapshot read fresh each request, the sentence of each refusal, a job's transcript and served files, the pictures
 * User uploads and the ones a transcript names, the origins allowed to frame the Bridge, and the Bridge itself, whose HTML import is the
 * one place the command surface reaches `bridge/`, by path, for Bun to bundle.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';

import bridgePage from '../../../bridge/index.html';

import { LogFileIngestion }                                   from '../../../src/adapters/log/LogFileIngestion.ts';
import { LogRecordMappingUtil }                               from '../../../src/adapters/log/utils/LogRecordMappingUtil.ts';
import { OperationRefusalWordingUtil }                        from '../../../src/adapters/utils/OperationRefusalWordingUtil.ts';
import type { LogRecord }                                     from '../../../src/lib/tracker-model/@types/LogRecord.ts';
import { BoardStateAssembly }                                 from '../../../src/services/overseer/BoardState.ts';
import type { EventBroker }                                   from '../../../src/services/overseer/EventBroker.ts';
import { JobTranscript }                                      from '../../../src/services/overseer/JobTranscript.ts';
import { MonitorSnapshotAssembly, type MonitorOverseerFacts } from '../../../src/services/overseer/MonitorSnapshotAssembly.ts';
import type { MonitorStream }                                 from '../../../src/services/overseer/MonitorStream.ts';
import type {
  OverseerRoutes,
  RouteAnswer,
  ServerRefusal,
  TranscriptFollower
} from '../../../src/services/overseer/OverseerServer.ts';
import { WatcherFleet }                                           from '../../../src/services/overseer/WatcherFleet.ts';
import { PictureStore, type PictureStoring }                      from '../../../src/services/tracker/PictureStore.ts';
import { OperationRefusal, type OperationRefusalDetail }          from '../../../src/shared/OperationRefusal.ts';
import { ACCEPTED_PICTURE_MEDIA_TYPES, PICTURE_SIZE_LIMIT_BYTES } from '../../../src/shared/constants/OverseerLimits.ts';
import { PRODUCT_NAMES }                                          from '../../../src/shared/constants/ProductNames.ts';
import { JOB_ID_PATTERN }                                         from '../../constants/RecordIdPatterns.ts';
import { readBoardState, type BoardStateSource }                  from './BoardStateReader.ts';
import { answerControlCommand, type CommandRouteRequest }         from './CommandRoute.ts';

export interface OverseerRouteRequest extends BoardStateSource, Omit<CommandRouteRequest, 'context'> {
  token:         () => string | null;
  started:       () => boolean;
  broker:        () => EventBroker | null;
  monitorStream: () => MonitorStream | null;
  /** `null` until the Overseer took its generation. */
  monitorFacts:  () => MonitorOverseerFacts | null;
}

const SERVER_REFUSAL_TEXT: Readonly<Record<ServerRefusal, string>> = {
  'unauthorized':      `This needs the Overseer's token or a Bridge session. The Overseer may have restarted: open the board again with \`${PRODUCT_NAMES.PROGRAM} open\`.`,
  'forbidden':         'The Overseer answers only its own page and programs on this machine that name it by 127.0.0.1 or localhost.',
  'read-failed':       `The Overseer could not read the board's files. Run \`${PRODUCT_NAMES.PROGRAM} status\` in the repository to see which file is wrong.`,
  'page-build-failed': 'The Overseer could not build the Bridge\'s page; its log names the cause.',
};

const MONITOR_STATUS = {
  ANSWERED: 200,
  STARTING: 503,
} as const;

/** agent-dashboard's own server record: its path is the dashboard's, never the product's naming constant. */
const DASHBOARD_SERVER_RECORD = ['.agent-progress-monitor', 'agent-dashboard', 'server.json'] as const;

function originOf(url: unknown): string[] {
  if (typeof url !== 'string') return [];
  try {
    return [new URL(url).origin];
  } catch {
    return [];
  }
}

/** With no readable record no origin may frame the Bridge. */
export function dashboardFrameOriginsOf(homeDirectory: string): string[] {
  try {
    const record: unknown = JSON.parse(readFileSync(join(homeDirectory, ...DASHBOARD_SERVER_RECORD), 'utf8'));
    if (typeof record !== 'object' || record === null) return [];
    const { url, boardOrigin } = record as { url?: unknown; boardOrigin?: unknown };
    return [...new Set([...originOf(url), ...originOf(boardOrigin)])];
  } catch {
    return [];
  }
}

function newestInstanceIn(jobFolder: string): number {
  let instance = 0;
  while (existsSync(join(jobFolder, `events-${instance + 1}.ndjson`))) instance += 1;
  return instance;
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
  return { status, body: { refusal: OperationRefusalWordingUtil.messageOf(new OperationRefusal('refused', detail)) } };
}

/** `POST /api/pictures`: the picture stored owner-only by its hash, or its refusal worded as every printed refusal is. */
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
  const jobFolderOf = (jobId: string): string | null => {
    if (!JOB_ID_PATTERN.test(jobId)) return null;
    const jobFolder = WatcherFleet.jobFolderOf(workspace.trackerDirectory, jobId);
    return existsSync(jobFolder) ? jobFolder : null;
  };
  return {
    token:   request.token,
    started: request.started,
    command: (body) => answerControlCommand(body, { ...request, context }),
    onNudge: request.wake,
    state:   () => readBoardState(request).state,
    summary: () => {
      const { state, project, readyTicketIds } = readBoardState(request);
      return BoardStateAssembly.summaryOf(state, project, readyTicketIds);
    },
    monitor: (): RouteAnswer => {
      const overseer = request.monitorFacts();
      if (overseer === null) return { status: MONITOR_STATUS.STARTING, body: { refusal: 'starting' } };
      return { status: MONITOR_STATUS.ANSWERED, body: MonitorSnapshotAssembly.monitorSnapshotOf({ ...readBoardState(request), overseer, now: context.now() }) };
    },
    monitorStream: request.monitorStream,
    refusalTextOf: (refusal) => SERVER_REFUSAL_TEXT[refusal],
    events:        request.broker,
    transcriptOf:  (jobId, after): TranscriptFollower | null => {
      const jobFolder = jobFolderOf(jobId);
      const startCursor = JobTranscript.cursorOf(after);
      if (jobFolder === null || startCursor === null) return null;
      let cursor = startCursor;
      return () => {
        const read = JobTranscript.entriesAfter(jobFolder, newestInstanceIn(jobFolder), cursor, {
          eventsOf:      (line) => context.agentAdapter.eventsOf(line),
          sentLineOf:    (line) => context.agentAdapter.sentLineOf(line),
          senderFactsOf: () => JobTranscript.senderFactsOf(logRecordsIn(workspace.logFilePath), workspace.trackerDirectory, jobId),
        });
        ({ cursor } = read);
        return read.entries;
      };
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
    frameOrigins: () => dashboardFrameOriginsOf(context.homeDirectory),
    page:         bridgePage,
  };
}
