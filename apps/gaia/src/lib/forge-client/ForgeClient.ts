/**
 * The HTTP client of one Overseer: its versions, identity, board summary, monitor snapshot and board document, its event streams, a
 * control or board command, a picture up and down, and a session code. Every call answers the forge's document or a verdict; the documents
 * stay unchecked JSON for the ingestions that read them. `/api/versions` is asked at its one path; every other endpoint at the version
 * forge's registry serves the supported forge version.
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
  ForgeSessionCodeAnswer,
  ForgeStreamEvent,
  ForgeStreamFollow,
  MonitorFollow,
  MonitorFollowEnd,
  OverseerAccess,
  OverseerAddress,
} from './@types/ForgeClientAnswer.ts';
import type {
  OverseerAnswer,
  OverseerAnswerForm,
  OverseerByteBody,
  OverseerFetch,
  OverseerRequest,
  OverseerStream,
} from './OverseerFetch.ts';
import { SUPPORTED_FORGE_VERSION } from './constants/SupportedForgeVersions.ts';

export interface ForgeClientSettings {
  readonly overseerFetch:                  OverseerFetch;
  readonly requestTimeoutMilliseconds?:    number;
  readonly streamOpenTimeoutMilliseconds?: number;
}

export interface ForgeClient {
  /** `GET /api/versions`, which a forge from before versions answers as any unknown path. */
  readonly versionsOf:      (overseerUrl: string) => Promise<ForgeDocumentAnswer>;
  readonly identityOf:      (address: OverseerAddress) => Promise<ForgeDocumentAnswer>;
  readonly summaryOf:       (address: OverseerAddress) => Promise<ForgeDocumentAnswer>;
  readonly monitorOf:       (access: OverseerAccess) => Promise<ForgeDocumentAnswer>;
  /** Hands each whole snapshot of the stream to `onSnapshot` as it arrives; an event the stream left unfinished is never handed on. */
  readonly followMonitor:   (access: OverseerAccess, onSnapshot: (document: unknown) => void) => MonitorFollow;
  readonly send:            (access: OverseerAccess, command: ForgeControlCommand) => Promise<ForgeCommandAnswer>;
  readonly sessionCodeOf:   (access: OverseerAccess) => Promise<ForgeSessionCodeAnswer>;
  readonly boardOf:         (access: OverseerAccess) => Promise<ForgeDocumentAnswer>;
  readonly presenceOf:      (access: OverseerAccess) => Promise<ForgeDocumentAnswer>;
  /** The board's events, each whole one handed to `onEvent` as it arrives; `lastEventId` replays what came after that event. */
  readonly followEvents:    (access: OverseerAccess, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void) => ForgeStreamFollow;
  /** A job's conversation from the cursor `after`, or from its start when `null`. */
  readonly followJobStream: (
    access: OverseerAccess, jobId: string, after: string | null, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void,
  ) => ForgeStreamFollow;
  /** A gate profile run's output lines after the line `after`, or from its first when `null`. */
  readonly followProfileStream: (
    access: OverseerAccess, profileRunId: string, after: string | null, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void,
  ) => ForgeStreamFollow;
  readonly uploadPicture:    (access: OverseerAccess, bytes: Uint8Array, mediaType: string) => Promise<ForgePictureUploadAnswer>;
  readonly pictureOf:        (access: OverseerAccess, pictureId: string) => Promise<ForgePictureAnswer>;
  /** Unlike `send`, keeps the forge's status and its whole body, so an install hold (423) reads apart from a refusal. */
  readonly sendBoardCommand: (access: OverseerAccess, body: JsonObject) => Promise<ForgeBoardCommandAnswer>;
}

const OVERSEER_REQUEST_TIMEOUT_MILLISECONDS = 5_000;
const MONITOR_STREAM_OPEN_TIMEOUT_MILLISECONDS = 5_000;

/** Each endpoint below `/api/`, without its version; a `{<name>}` segment is filled per call. */
const OVERSEER_ENDPOINTS = {
  identity:      'identity',
  summary:       'summary',
  monitor:       'monitor',
  monitorEvents: 'monitor/events',
  commands:      'commands',
  sessionCodes:  'session-codes',
  board:         'board',
  presence:      'presence',
  events:        'events',
  jobStream:     'jobs/{jobId}/stream',
  profileStream: 'profiles/{profileRunId}/stream',
  pictures:      'pictures',
  picture:       'pictures/{pictureId}',
} as const;

export type OverseerEndpointName = keyof typeof OVERSEER_ENDPOINTS;

/**
 * The version of the endpoint that forge's compatibility registry serves the forge version this client supports. Every endpoint the client
 * calls has one, as its spec holds, so the throw marks a registry that dropped one, never a forge's answer.
 */
export function forgeEndpointVersionOf(endpointName: OverseerEndpointName): number {
  const endpoint = OVERSEER_ENDPOINTS[endpointName];
  const version = CompatibilityRegistryUtil.endpointVersionAt(FORGE_COMPATIBILITY_REGISTRY, endpoint, SUPPORTED_FORGE_VERSION);
  if (version === null) throw new Error(`The forge version this client supports serves no ${endpoint} endpoint.`);
  return version;
}

/** The versioned path Gaia calls an endpoint at, each template segment filled from `values`. */
export function forgeEndpointPathOf(endpointName: OverseerEndpointName, values: Readonly<Record<string, string>> = {}): string {
  const endpointPath = CompatibilityRegistryUtil.endpointPathOf(OVERSEER_ENDPOINTS[endpointName], values);
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

function successBodyOf(answer: OverseerAnswer): SuccessBody {
  if (answer.verdict !== 'answered') return { verdict: 'unreachable' };
  if (answer.status === UNAUTHORIZED_STATUS) return { verdict: 'unauthorized' };
  if (answer.status !== SUCCESS_STATUS) return refusalOf(answer.bodyText);
  const parsing = JsonValueUtil.parsedValueOf(answer.bodyText);
  return parsing === null ? { verdict: 'malformed' } : { verdict: 'success', parsed: parsing.parsed };
}

function documentAnswerOf(answer: OverseerAnswer): ForgeDocumentAnswer {
  const body = successBodyOf(answer);
  return body.verdict === 'success' ? { verdict: 'answered', document: body.parsed } : body;
}

function commandAnswerOf(answer: OverseerAnswer): ForgeCommandAnswer {
  const body = successBodyOf(answer);
  if (body.verdict !== 'success') return body;
  const outcome = JsonValueUtil.isJsonObject(body.parsed) ? JsonValueUtil.ownValueOf(body.parsed, 'outcome') : undefined;
  return outcome === 'done' || outcome === 'nothing-to-do' ? { verdict: 'answered', outcome } : { verdict: 'malformed' };
}

/** Keeps the status of every answer but a refused token, and its body parsed, for the command's ingestion to read. */
function boardCommandAnswerOf(answer: OverseerAnswer): ForgeBoardCommandAnswer {
  if (answer.verdict !== 'answered') return { verdict: 'unreachable' };
  if (answer.status === UNAUTHORIZED_STATUS) return { verdict: 'unauthorized' };
  const parsing = JsonValueUtil.parsedValueOf(answer.bodyText);
  return parsing === null ? { verdict: 'malformed' } : { verdict: 'answered', status: answer.status, body: parsing.parsed };
}

function pictureAnswerOf(answer: OverseerAnswer): ForgePictureAnswer {
  if (answer.verdict !== 'answered') return { verdict: 'unreachable' };
  if (answer.status === UNAUTHORIZED_STATUS) return { verdict: 'unauthorized' };
  return {
    verdict: 'answered', status: answer.status, contentType: answer.contentType, bytes: answer.bodyBytes ?? new TextEncoder().encode(answer.bodyText),
  };
}

function streamEventOf(event: ServerSentEvent): ForgeStreamEvent {
  return { id: event.lastEventId === '' ? null : event.lastEventId, eventName: event.eventName, data: event.data };
}

function sessionCodeAnswerOf(answer: OverseerAnswer): ForgeSessionCodeAnswer {
  const body = successBodyOf(answer);
  if (body.verdict !== 'success') return body;
  const code = JsonValueUtil.isJsonObject(body.parsed) ? ownTextOf(body.parsed, 'code') : null;
  return code === null || code === '' ? { verdict: 'malformed' } : { verdict: 'answered', code };
}

export function forgeClientOf(settings: ForgeClientSettings): ForgeClient {
  const { overseerFetch } = settings;
  const requestTimeoutMilliseconds    = settings.requestTimeoutMilliseconds ?? OVERSEER_REQUEST_TIMEOUT_MILLISECONDS;
  const streamOpenTimeoutMilliseconds = settings.streamOpenTimeoutMilliseconds ?? MONITOR_STREAM_OPEN_TIMEOUT_MILLISECONDS;

  function overseerRequestOf(overseerUrl: string, method: OverseerRequest['method'], path: string, bearerToken: string | null, jsonBody: string | null): OverseerRequest {
    return byteRequestOf(overseerUrl, method, path, bearerToken, { jsonBody, byteBody: null, answerAs: 'text' });
  }

  function byteRequestOf(
    overseerUrl: string,
    method: OverseerRequest['method'],
    path: string,
    bearerToken: string | null,
    bodies: { readonly jsonBody: string | null; readonly byteBody: OverseerByteBody | null; readonly answerAs: OverseerAnswerForm },
  ): OverseerRequest {
    return {
      overseerUrl, method, path, bearerToken, ...bodies, timeoutMilliseconds: requestTimeoutMilliseconds,
    };
  }

  async function versionsOf(overseerUrl: string): Promise<ForgeDocumentAnswer> {
    return documentAnswerOf(await overseerFetch.request(overseerRequestOf(overseerUrl, 'GET', ApiPathUtil.VERSIONS_PATH, null, null)));
  }

  async function identityOf({ overseerUrl }: OverseerAddress): Promise<ForgeDocumentAnswer> {
    return documentAnswerOf(await overseerFetch.request(overseerRequestOf(overseerUrl, 'GET', forgeEndpointPathOf('identity'), null, null)));
  }

  async function summaryOf({ overseerUrl }: OverseerAddress): Promise<ForgeDocumentAnswer> {
    return documentAnswerOf(await overseerFetch.request(overseerRequestOf(overseerUrl, 'GET', forgeEndpointPathOf('summary'), null, null)));
  }

  async function monitorOf(access: OverseerAccess): Promise<ForgeDocumentAnswer> {
    return documentAnswerOf(await overseerFetch.request(overseerRequestOf(access.overseerUrl, 'GET', forgeEndpointPathOf('monitor'), access.bearerToken, null)));
  }

  async function send(access: OverseerAccess, command: ForgeControlCommand): Promise<ForgeCommandAnswer> {
    const commandRequest = overseerRequestOf(access.overseerUrl, 'POST', forgeEndpointPathOf('commands'), access.bearerToken, JSON.stringify(command));
    return commandAnswerOf(await overseerFetch.request(commandRequest));
  }

  async function sessionCodeOf(access: OverseerAccess): Promise<ForgeSessionCodeAnswer> {
    const sessionCodeRequest = overseerRequestOf(access.overseerUrl, 'POST', forgeEndpointPathOf('sessionCodes'), access.bearerToken, null);
    return sessionCodeAnswerOf(await overseerFetch.request(sessionCodeRequest));
  }

  async function boardOf(access: OverseerAccess): Promise<ForgeDocumentAnswer> {
    return documentAnswerOf(await overseerFetch.request(overseerRequestOf(access.overseerUrl, 'GET', forgeEndpointPathOf('board'), access.bearerToken, null)));
  }

  async function presenceOf(access: OverseerAccess): Promise<ForgeDocumentAnswer> {
    return documentAnswerOf(await overseerFetch.request(overseerRequestOf(access.overseerUrl, 'GET', forgeEndpointPathOf('presence'), access.bearerToken, null)));
  }

  async function sendBoardCommand(access: OverseerAccess, body: JsonObject): Promise<ForgeBoardCommandAnswer> {
    const commandRequest = overseerRequestOf(access.overseerUrl, 'POST', forgeEndpointPathOf('commands'), access.bearerToken, JSON.stringify(body));
    return boardCommandAnswerOf(await overseerFetch.request(commandRequest));
  }

  async function uploadPicture(access: OverseerAccess, bytes: Uint8Array, mediaType: string): Promise<ForgePictureUploadAnswer> {
    const uploadBodies = { jsonBody: null, byteBody: { bytes, mediaType }, answerAs: 'text' } as const;
    const uploadRequest = byteRequestOf(access.overseerUrl, 'POST', forgeEndpointPathOf('pictures'), access.bearerToken, uploadBodies);
    return boardCommandAnswerOf(await overseerFetch.request(uploadRequest));
  }

  async function pictureOf(access: OverseerAccess, pictureId: string): Promise<ForgePictureAnswer> {
    const pictureBodies = { jsonBody: null, byteBody: null, answerAs: 'bytes' } as const;
    const pictureRequest = byteRequestOf(access.overseerUrl, 'GET', forgeEndpointPathOf('picture', { pictureId }), access.bearerToken, pictureBodies);
    return pictureAnswerOf(await overseerFetch.request(pictureRequest));
  }

  /** Hands each whole event of the stream at `path` to `onEvent`; an event the stream left unfinished is never handed on. */
  function followEventStream(access: OverseerAccess, path: string, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void): ForgeStreamFollow {
    let stopIsRequested = false;
    let openStream: OverseerStream | null = null;

    async function follow(): Promise<MonitorFollowEnd> {
      const opening = await overseerFetch.openStream({
        overseerUrl:         access.overseerUrl,
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

  function followMonitor(access: OverseerAccess, onSnapshot: (document: unknown) => void): MonitorFollow {
    return followEventStream(access, forgeEndpointPathOf('monitorEvents'), null, (event) => {
      if (event.eventName !== MONITOR_EVENT_NAME) return;
      // A snapshot that cannot be read is passed over: the next whole one replaces it.
      const parsing = JsonValueUtil.parsedValueOf(event.data);
      if (parsing !== null) onSnapshot(parsing.parsed);
    });
  }

  function followEvents(access: OverseerAccess, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void): ForgeStreamFollow {
    return followEventStream(access, forgeEndpointPathOf('events'), lastEventId, onEvent);
  }

  function followJobStream(
    access: OverseerAccess, jobId: string, after: string | null, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void,
  ): ForgeStreamFollow {
    return followEventStream(access, streamPathOf(forgeEndpointPathOf('jobStream', { jobId }), after), lastEventId, onEvent);
  }

  function followProfileStream(
    access: OverseerAccess, profileRunId: string, after: string | null, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void,
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
    sessionCodeOf,
    boardOf,
    presenceOf,
    followEvents,
    followJobStream,
    followProfileStream,
    uploadPicture,
    pictureOf,
    sendBoardCommand,
  };
}
