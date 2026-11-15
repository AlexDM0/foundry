/**
 * The HTTP client of one Overseer: its versions, identity, board summary and monitor snapshot, the monitor stream, a control command and
 * a session code. Every call answers the forge's document or a verdict; the documents stay unchecked JSON for the ingestions that read
 * them. `/api/versions` is asked at its one path; every other endpoint at the paths the caller names.
 */
import type { ForgeControlCommand }                    from 'forge-contracts/ForgeControlCommand';
import { OVERSEER_ENDPOINT_VERSIONS }                  from 'forge-contracts/ForgeSystemVersions';
import { ApiPathUtil }                                 from '../api-paths/ApiPathUtil.ts';
import { eventStreamParserOf, type EventStreamParser } from '../event-stream/EventStreamParser.ts';
import { JsonValueUtil, type JsonObject }              from '../json-value/JsonValueUtil.ts';

import type {
  ForgeClientFailure,
  ForgeCommandAnswer,
  ForgeDocumentAnswer,
  ForgeSessionCodeAnswer,
  MonitorFollow,
  MonitorFollowEnd,
  OverseerAccess,
  OverseerAddress,
  OverseerPaths,
} from './@types/ForgeClientAnswer.ts';
import type {
  OverseerAnswer,
  OverseerFetch,
  OverseerRequest,
  OverseerStream,
} from './OverseerFetch.ts';

export interface ForgeClientSettings {
  readonly overseerFetch:                  OverseerFetch;
  readonly requestTimeoutMilliseconds?:    number;
  readonly streamOpenTimeoutMilliseconds?: number;
}

export interface ForgeClient {
  /** `GET /api/versions`, which a forge from before versions answers as any unknown path. */
  readonly versionsOf:    (overseerUrl: string) => Promise<ForgeDocumentAnswer>;
  readonly identityOf:    (address: OverseerAddress) => Promise<ForgeDocumentAnswer>;
  readonly summaryOf:     (address: OverseerAddress) => Promise<ForgeDocumentAnswer>;
  readonly monitorOf:     (access: OverseerAccess) => Promise<ForgeDocumentAnswer>;
  /** Hands each whole snapshot of the stream to `onSnapshot` as it arrives; an event the stream left unfinished is never handed on. */
  readonly followMonitor: (access: OverseerAccess, onSnapshot: (document: unknown) => void) => MonitorFollow;
  readonly send:          (access: OverseerAccess, command: ForgeControlCommand) => Promise<ForgeCommandAnswer>;
  readonly sessionCodeOf: (access: OverseerAccess) => Promise<ForgeSessionCodeAnswer>;
}

const OVERSEER_REQUEST_TIMEOUT_MILLISECONDS = 5_000;
const MONITOR_STREAM_OPEN_TIMEOUT_MILLISECONDS = 5_000;

/** Each endpoint below `/api/`, without its version. */
const OVERSEER_ENDPOINTS = {
  identity:      'identity',
  summary:       'summary',
  monitor:       'monitor',
  monitorEvents: 'monitor/events',
  commands:      'commands',
  sessionCodes:  'session-codes',
} as const satisfies Readonly<Record<keyof typeof OVERSEER_ENDPOINT_VERSIONS, string>>;

type OverseerEndpointName = keyof typeof OVERSEER_ENDPOINTS;

function pathOf(endpointName: OverseerEndpointName, paths: OverseerPaths): string {
  const endpoint = OVERSEER_ENDPOINTS[endpointName];
  return paths === 'versioned' ? ApiPathUtil.versionedPathOf(endpoint, OVERSEER_ENDPOINT_VERSIONS[endpointName]) : ApiPathUtil.unversionedPathOf(endpoint);
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
    return {
      overseerUrl, method, path, bearerToken, jsonBody, timeoutMilliseconds: requestTimeoutMilliseconds,
    };
  }

  async function versionsOf(overseerUrl: string): Promise<ForgeDocumentAnswer> {
    return documentAnswerOf(await overseerFetch.request(overseerRequestOf(overseerUrl, 'GET', ApiPathUtil.VERSIONS_PATH, null, null)));
  }

  async function identityOf({ overseerUrl, paths }: OverseerAddress): Promise<ForgeDocumentAnswer> {
    return documentAnswerOf(await overseerFetch.request(overseerRequestOf(overseerUrl, 'GET', pathOf('identity', paths), null, null)));
  }

  async function summaryOf({ overseerUrl, paths }: OverseerAddress): Promise<ForgeDocumentAnswer> {
    return documentAnswerOf(await overseerFetch.request(overseerRequestOf(overseerUrl, 'GET', pathOf('summary', paths), null, null)));
  }

  async function monitorOf(access: OverseerAccess): Promise<ForgeDocumentAnswer> {
    return documentAnswerOf(await overseerFetch.request(overseerRequestOf(access.overseerUrl, 'GET', pathOf('monitor', access.paths), access.bearerToken, null)));
  }

  async function send(access: OverseerAccess, command: ForgeControlCommand): Promise<ForgeCommandAnswer> {
    const commandRequest = overseerRequestOf(access.overseerUrl, 'POST', pathOf('commands', access.paths), access.bearerToken, JSON.stringify(command));
    return commandAnswerOf(await overseerFetch.request(commandRequest));
  }

  async function sessionCodeOf(access: OverseerAccess): Promise<ForgeSessionCodeAnswer> {
    const sessionCodeRequest = overseerRequestOf(access.overseerUrl, 'POST', pathOf('sessionCodes', access.paths), access.bearerToken, null);
    return sessionCodeAnswerOf(await overseerFetch.request(sessionCodeRequest));
  }

  function followMonitor(access: OverseerAccess, onSnapshot: (document: unknown) => void): MonitorFollow {
    let stopIsRequested = false;
    let openStream: OverseerStream | null = null;

    function handOnWholeSnapshots(text: string, parser: EventStreamParser): void {
      for (const event of parser.eventsOf(text)) {
        if (stopIsRequested) return;
        if (event.eventName !== MONITOR_EVENT_NAME) continue;
        // A snapshot that cannot be read is passed over: the next whole one replaces it.
        const parsing = JsonValueUtil.parsedValueOf(event.data);
        if (parsing !== null) onSnapshot(parsing.parsed);
      }
    }

    async function follow(): Promise<MonitorFollowEnd> {
      const opening = await overseerFetch.openStream({
        overseerUrl:         access.overseerUrl,
        path:                pathOf('monitorEvents', access.paths),
        bearerToken:         access.bearerToken,
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
      // A throw of the caller's snapshot handler rejects `ended`, and still closes the stream.
      try {
        let chunk = await stream.nextChunk();
        while (chunk.kind === 'text') {
          handOnWholeSnapshots(chunk.text, parser);
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

  return {
    versionsOf, identityOf, summaryOf, monitorOf, followMonitor, send, sessionCodeOf,
  };
}
