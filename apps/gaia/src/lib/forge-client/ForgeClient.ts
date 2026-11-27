/**
 * The HTTP client of one Hephaestus: versions, identity, summary, snapshot, board, ticket documents, streams, commands, pictures and session codes.
 * Every call answers the forge's unchecked JSON document or a verdict; `/api/versions` is asked at its one path, every other endpoint at the
 * supported forge version's.
 */
import { FORGE_COMPATIBILITY_REGISTRY }              from 'forge-contracts/ForgeCompatibilityRegistry';
import type { ForgeControlCommand }                  from 'forge-contracts/ForgeControlCommand';
import { CompatibilityRegistryUtil }                 from 'system-versions/CompatibilityRegistryUtil';
import { ApiPathUtil }                               from '../api-paths/ApiPathUtil.ts';
import { eventStreamParserOf, type ServerSentEvent } from '../event-stream/EventStreamParser.ts';
import { JsonValueUtil, type JsonObject }            from '../json-value/JsonValueUtil.ts';

import type {
  ForgeBoardCommandAnswer,
  ForgeClientFailure,
  ForgeCommandAnswer,
  ForgeDocumentAnswer,
  ForgePictureAnswer,
  ForgePictureUploadAnswer,
  ForgeStreamEvent,
  ForgeStreamFollow,
  ForgeTicketDocumentsAnswer,
  MonitorFollow,
  MonitorFollowEnd,
  HephaestusAccess,
  HephaestusAddress,
} from './@types/ForgeClientAnswer.ts';
import type {
  HephaestusAnswer,
  HephaestusAnswerForm,
  HephaestusByteBody,
  HephaestusFetch,
  HephaestusRequest,
  HephaestusStream,
} from './HephaestusFetch.ts';
import { SUPPORTED_FORGE_VERSION } from './constants/SupportedForgeVersions.ts';

export interface ForgeClientSettings {
  readonly hephaestusFetch:                HephaestusFetch;
  readonly requestTimeoutMilliseconds?:    number;
  readonly streamOpenTimeoutMilliseconds?: number;
}

export interface ForgeClient {
  /** `GET /api/versions`, which a forge from before versions answers as any unknown path. */
  readonly versionsOf:      (hephaestusUrl: string) => Promise<ForgeDocumentAnswer>;
  readonly identityOf:      (address: HephaestusAddress) => Promise<ForgeDocumentAnswer>;
  readonly summaryOf:       (address: HephaestusAddress) => Promise<ForgeDocumentAnswer>;
  readonly monitorOf:       (access: HephaestusAccess) => Promise<ForgeDocumentAnswer>;
  /** Hands each whole snapshot of the stream to `onSnapshot` as it arrives; an event the stream left unfinished is never handed on. */
  readonly followMonitor:   (access: HephaestusAccess, onSnapshot: (document: unknown) => void) => MonitorFollow;
  readonly send:            (access: HephaestusAccess, command: ForgeControlCommand) => Promise<ForgeCommandAnswer>;
  readonly boardOf:         (access: HephaestusAccess) => Promise<ForgeDocumentAnswer>;
  readonly presenceOf:      (access: HephaestusAccess) => Promise<ForgeDocumentAnswer>;
  /** One crash log by its number; a number with no log is the forge's refusal `no-crash-log`. */
  readonly crashLogOf:      (access: HephaestusAccess, crashLogNumber: number) => Promise<ForgeDocumentAnswer>;
  /** The board's events, each whole one handed to `onEvent` as it arrives; `lastEventId` replays what came after that event. */
  readonly followEvents:    (access: HephaestusAccess, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void) => ForgeStreamFollow;
  /** A job's conversation from the cursor `after`, or from its start when `null`. */
  readonly followJobStream: (
    access: HephaestusAccess, jobId: string, after: string | null, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void,
  ) => ForgeStreamFollow;
  /** A gate profile run's output lines after the line `after`, or from its first when `null`. */
  readonly followProfileStream: (
    access: HephaestusAccess, profileRunId: string, after: string | null, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void,
  ) => ForgeStreamFollow;
  readonly uploadPicture:     (access: HephaestusAccess, bytes: Uint8Array, mediaType: string) => Promise<ForgePictureUploadAnswer>;
  readonly pictureOf:         (access: HephaestusAccess, pictureId: string) => Promise<ForgePictureAnswer>;
  /** Unlike `send`, keeps the forge's status and its whole body, so an install hold (423) reads apart from a refusal. */
  readonly sendBoardCommand:  (access: HephaestusAccess, body: JsonObject) => Promise<ForgeBoardCommandAnswer>;
  /** Keeps the forge's status and its whole body, so a ticket with no documents (404) reads with the forge's code, fields and sentence. */
  readonly ticketDocumentsOf: (access: HephaestusAccess, ticketId: string) => Promise<ForgeTicketDocumentsAnswer>;
}

const HEPHAESTUS_REQUEST_TIMEOUT_MILLISECONDS = 5_000;
const MONITOR_STREAM_OPEN_TIMEOUT_MILLISECONDS = 5_000;

/** Each endpoint below `/api/`, without its version; a `{<name>}` segment is filled per call. */
const HEPHAESTUS_ENDPOINTS = {
  identity:        'identity',
  summary:         'summary',
  monitor:         'monitor',
  monitorEvents:   'monitor/events',
  commands:        'commands',
  board:           'board',
  presence:        'presence',
  crashLog:        'crash-log',
  events:          'events',
  jobStream:       'jobs/{jobId}/stream',
  profileStream:   'profiles/{profileRunId}/stream',
  pictures:        'pictures',
  picture:         'pictures/{pictureId}',
  ticketDocuments: 'tickets/{ticketId}/documents',
} as const;

export type HephaestusEndpointName = keyof typeof HEPHAESTUS_ENDPOINTS;

/**
 * The version of the endpoint that forge's compatibility registry serves the forge version this client supports. Every endpoint the client
 * calls has one, as its spec holds, so the throw marks a registry that dropped one, never a forge's answer.
 */
export function forgeEndpointVersionOf(endpointName: HephaestusEndpointName): number {
  const endpoint = HEPHAESTUS_ENDPOINTS[endpointName];
  const version = CompatibilityRegistryUtil.endpointVersionAt(FORGE_COMPATIBILITY_REGISTRY, endpoint, SUPPORTED_FORGE_VERSION);
  if (version === null) throw new Error(`The forge version this client supports serves no ${endpoint} endpoint.`);
  return version;
}

/** The versioned path Gaia calls an endpoint at, each template segment filled from `values`. */
export function forgeEndpointPathOf(endpointName: HephaestusEndpointName, values: Readonly<Record<string, string>> = {}): string {
  const endpointPath = CompatibilityRegistryUtil.endpointPathOf(HEPHAESTUS_ENDPOINTS[endpointName], values);
  return ApiPathUtil.versionedPathOf(endpointPath, forgeEndpointVersionOf(endpointName));
}

/** The path of a stream that starts after a cursor: `after=<cursor>` in its query, none when `null`. */
function streamPathOf(path: string, after: string | null): string {
  return after === null ? path : `${path}?${new URLSearchParams({ after }).toString()}`;
}

const SUCCESS_STATUS = 200;
const UNAUTHORIZED_STATUS = 401;
const MONITOR_EVENT_NAME = 'monitor';

type SuccessBody = { readonly verdict: 'success'; readonly parsed: unknown } | ForgeClientFailure;

function ownTextOf(record: JsonObject, key: string): string | null {
  const value = JsonValueUtil.ownValueOf(record, key);
  return typeof value === 'string' ? value : null;
}

function refusalOf(bodyText: string): ForgeClientFailure {
  const parsing = JsonValueUtil.parsedValueOf(bodyText);
  if (parsing === null || !JsonValueUtil.isJsonObject(parsing.parsed)) return { verdict: 'refused', refusal: null, text: null };
  return { verdict: 'refused', refusal: ownTextOf(parsing.parsed, 'refusal'), text: ownTextOf(parsing.parsed, 'text') };
}

function successBodyOf(answer: HephaestusAnswer): SuccessBody {
  if (answer.verdict !== 'answered') return { verdict: 'unreachable' };
  if (answer.status === UNAUTHORIZED_STATUS) return { verdict: 'unauthorized' };
  if (answer.status !== SUCCESS_STATUS) return refusalOf(answer.bodyText);
  const parsing = JsonValueUtil.parsedValueOf(answer.bodyText);
  return parsing === null ? { verdict: 'malformed' } : { verdict: 'success', parsed: parsing.parsed };
}

function documentAnswerOf(answer: HephaestusAnswer): ForgeDocumentAnswer {
  const body = successBodyOf(answer);
  return body.verdict === 'success' ? { verdict: 'answered', document: body.parsed } : body;
}

function commandAnswerOf(answer: HephaestusAnswer): ForgeCommandAnswer {
  const body = successBodyOf(answer);
  if (body.verdict !== 'success') return body;
  const outcome = JsonValueUtil.isJsonObject(body.parsed) ? JsonValueUtil.ownValueOf(body.parsed, 'outcome') : undefined;
  return outcome === 'done' || outcome === 'nothing-to-do' ? { verdict: 'answered', outcome } : { verdict: 'malformed' };
}

/** Keeps the status of every answer but a refused token, and its body parsed, for the command's or the documents' ingestion to read. */
function boardCommandAnswerOf(answer: HephaestusAnswer): ForgeBoardCommandAnswer {
  if (answer.verdict !== 'answered') return { verdict: 'unreachable' };
  if (answer.status === UNAUTHORIZED_STATUS) return { verdict: 'unauthorized' };
  const parsing = JsonValueUtil.parsedValueOf(answer.bodyText);
  return parsing === null ? { verdict: 'malformed' } : { verdict: 'answered', status: answer.status, body: parsing.parsed };
}

function pictureAnswerOf(answer: HephaestusAnswer): ForgePictureAnswer {
  if (answer.verdict !== 'answered') return { verdict: 'unreachable' };
  if (answer.status === UNAUTHORIZED_STATUS) return { verdict: 'unauthorized' };
  return {
    verdict: 'answered', status: answer.status, contentType: answer.contentType, bytes: answer.bodyBytes ?? new TextEncoder().encode(answer.bodyText),
  };
}

function streamEventOf(event: ServerSentEvent): ForgeStreamEvent {
  return { id: event.lastEventId === '' ? null : event.lastEventId, eventName: event.eventName, data: event.data };
}

export function forgeClientOf(settings: ForgeClientSettings): ForgeClient {
  const { hephaestusFetch } = settings;
  const requestTimeoutMilliseconds    = settings.requestTimeoutMilliseconds ?? HEPHAESTUS_REQUEST_TIMEOUT_MILLISECONDS;
  const streamOpenTimeoutMilliseconds = settings.streamOpenTimeoutMilliseconds ?? MONITOR_STREAM_OPEN_TIMEOUT_MILLISECONDS;

  function hephaestusRequestOf(hephaestusUrl: string, method: HephaestusRequest['method'], path: string, bearerToken: string | null, jsonBody: string | null): HephaestusRequest {
    return byteRequestOf(hephaestusUrl, method, path, bearerToken, { jsonBody, byteBody: null, answerAs: 'text' });
  }

  function byteRequestOf(
    hephaestusUrl: string,
    method: HephaestusRequest['method'],
    path: string,
    bearerToken: string | null,
    bodies: { readonly jsonBody: string | null; readonly byteBody: HephaestusByteBody | null; readonly answerAs: HephaestusAnswerForm },
  ): HephaestusRequest {
    return {
      hephaestusUrl, method, path, bearerToken, ...bodies, timeoutMilliseconds: requestTimeoutMilliseconds,
    };
  }

  async function versionsOf(hephaestusUrl: string): Promise<ForgeDocumentAnswer> {
    return documentAnswerOf(await hephaestusFetch.request(hephaestusRequestOf(hephaestusUrl, 'GET', ApiPathUtil.VERSIONS_PATH, null, null)));
  }

  async function identityOf({ hephaestusUrl }: HephaestusAddress): Promise<ForgeDocumentAnswer> {
    return documentAnswerOf(await hephaestusFetch.request(hephaestusRequestOf(hephaestusUrl, 'GET', forgeEndpointPathOf('identity'), null, null)));
  }

  async function summaryOf({ hephaestusUrl }: HephaestusAddress): Promise<ForgeDocumentAnswer> {
    return documentAnswerOf(await hephaestusFetch.request(hephaestusRequestOf(hephaestusUrl, 'GET', forgeEndpointPathOf('summary'), null, null)));
  }

  async function monitorOf(access: HephaestusAccess): Promise<ForgeDocumentAnswer> {
    return documentAnswerOf(await hephaestusFetch.request(hephaestusRequestOf(access.hephaestusUrl, 'GET', forgeEndpointPathOf('monitor'), access.bearerToken, null)));
  }

  async function send(access: HephaestusAccess, command: ForgeControlCommand): Promise<ForgeCommandAnswer> {
    const commandRequest = hephaestusRequestOf(access.hephaestusUrl, 'POST', forgeEndpointPathOf('commands'), access.bearerToken, JSON.stringify(command));
    return commandAnswerOf(await hephaestusFetch.request(commandRequest));
  }

  async function boardOf(access: HephaestusAccess): Promise<ForgeDocumentAnswer> {
    return documentAnswerOf(await hephaestusFetch.request(hephaestusRequestOf(access.hephaestusUrl, 'GET', forgeEndpointPathOf('board'), access.bearerToken, null)));
  }

  async function presenceOf(access: HephaestusAccess): Promise<ForgeDocumentAnswer> {
    return documentAnswerOf(await hephaestusFetch.request(hephaestusRequestOf(access.hephaestusUrl, 'GET', forgeEndpointPathOf('presence'), access.bearerToken, null)));
  }

  async function crashLogOf(access: HephaestusAccess, crashLogNumber: number): Promise<ForgeDocumentAnswer> {
    const crashLogPath = `${forgeEndpointPathOf('crashLog')}?${new URLSearchParams({ number: String(crashLogNumber) }).toString()}`;
    return documentAnswerOf(await hephaestusFetch.request(hephaestusRequestOf(access.hephaestusUrl, 'GET', crashLogPath, access.bearerToken, null)));
  }

  async function sendBoardCommand(access: HephaestusAccess, body: JsonObject): Promise<ForgeBoardCommandAnswer> {
    const commandRequest = hephaestusRequestOf(access.hephaestusUrl, 'POST', forgeEndpointPathOf('commands'), access.bearerToken, JSON.stringify(body));
    return boardCommandAnswerOf(await hephaestusFetch.request(commandRequest));
  }

  async function ticketDocumentsOf(access: HephaestusAccess, ticketId: string): Promise<ForgeTicketDocumentsAnswer> {
    const documentsPath = forgeEndpointPathOf('ticketDocuments', { ticketId });
    return boardCommandAnswerOf(await hephaestusFetch.request(hephaestusRequestOf(access.hephaestusUrl, 'GET', documentsPath, access.bearerToken, null)));
  }

  async function uploadPicture(access: HephaestusAccess, bytes: Uint8Array, mediaType: string): Promise<ForgePictureUploadAnswer> {
    const uploadBodies = { jsonBody: null, byteBody: { bytes, mediaType }, answerAs: 'text' } as const;
    const uploadRequest = byteRequestOf(access.hephaestusUrl, 'POST', forgeEndpointPathOf('pictures'), access.bearerToken, uploadBodies);
    return boardCommandAnswerOf(await hephaestusFetch.request(uploadRequest));
  }

  async function pictureOf(access: HephaestusAccess, pictureId: string): Promise<ForgePictureAnswer> {
    const pictureBodies = { jsonBody: null, byteBody: null, answerAs: 'bytes' } as const;
    const pictureRequest = byteRequestOf(access.hephaestusUrl, 'GET', forgeEndpointPathOf('picture', { pictureId }), access.bearerToken, pictureBodies);
    return pictureAnswerOf(await hephaestusFetch.request(pictureRequest));
  }

  /** Hands each whole event of the stream at `path` to `onEvent`; an event the stream left unfinished is never handed on. */
  function followEventStream(access: HephaestusAccess, path: string, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void): ForgeStreamFollow {
    let stopIsRequested = false;
    let openStream: HephaestusStream | null = null;

    async function follow(): Promise<MonitorFollowEnd> {
      const opening = await hephaestusFetch.openStream({
        hephaestusUrl:       access.hephaestusUrl,
        path,
        bearerToken:         access.bearerToken,
        lastEventId,
        timeoutMilliseconds: streamOpenTimeoutMilliseconds,
      });
      if (opening.verdict !== 'streaming') {
        if (stopIsRequested) return { verdict: 'ended', ending: 'stopped' };
        const body = successBodyOf(opening);
        // A success that is no event stream cannot be followed.
        return body.verdict === 'success' ? { verdict: 'malformed' } : body;
      }
      const { stream } = opening;
      openStream = stream;
      if (stopIsRequested) stream.close();
      const parser = eventStreamParserOf();
      // A throw of the caller's event handler rejects `ended`, and still closes the stream.
      try {
        let chunk = await stream.nextChunk();
        while (chunk.kind === 'text') {
          for (const event of parser.eventsOf(chunk.text)) {
            if (stopIsRequested) break;
            onEvent(streamEventOf(event));
          }
          chunk = await stream.nextChunk();
        }
        return { verdict: 'ended', ending: stopIsRequested ? 'stopped' : chunk.ending };
      } finally {
        stream.close();
      }
    }

    function stop(): void {
      stopIsRequested = true;
      openStream?.close();
    }

    return { ended: follow(), stop };
  }

  function followMonitor(access: HephaestusAccess, onSnapshot: (document: unknown) => void): MonitorFollow {
    return followEventStream(access, forgeEndpointPathOf('monitorEvents'), null, (event) => {
      if (event.eventName !== MONITOR_EVENT_NAME) return;
      // A snapshot that cannot be read is passed over: the next whole one replaces it.
      const parsing = JsonValueUtil.parsedValueOf(event.data);
      if (parsing !== null) onSnapshot(parsing.parsed);
    });
  }

  function followEvents(access: HephaestusAccess, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void): ForgeStreamFollow {
    return followEventStream(access, forgeEndpointPathOf('events'), lastEventId, onEvent);
  }

  function followJobStream(
    access: HephaestusAccess, jobId: string, after: string | null, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void,
  ): ForgeStreamFollow {
    return followEventStream(access, streamPathOf(forgeEndpointPathOf('jobStream', { jobId }), after), lastEventId, onEvent);
  }

  function followProfileStream(
    access: HephaestusAccess, profileRunId: string, after: string | null, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void,
  ): ForgeStreamFollow {
    return followEventStream(access, streamPathOf(forgeEndpointPathOf('profileStream', { profileRunId }), after), lastEventId, onEvent);
  }

  return {
    versionsOf,
    identityOf,
    summaryOf,
    monitorOf,
    followMonitor,
    send,
    boardOf,
    presenceOf,
    crashLogOf,
    followEvents,
    followJobStream,
    followProfileStream,
    uploadPicture,
    pictureOf,
    sendBoardCommand,
    ticketDocumentsOf,
  };
}
