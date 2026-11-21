/**
 * The three relayed streams of a forge's board: `GET /api/v1/forges/<trackerId>/board/events`, `.../jobs/<jobId>/stream` and
 * `.../profiles/<profileRunId>/stream`. Each follows the forge's stream from the page's `Last-Event-ID` and `after`, and hands every event
 * to `BoardStreams`, ingested and mapped to the page's contract by its kind: a board event as a change signal, a job stream's `history` and
 * `message` and a profile stream's `line` as a `ConversationDocument`. An event that does not ingest is dropped, never forwarded raw.
 */
import type { DocumentReadingFailure }                              from '../../../adapters/forge-api/@types/ForgeDocumentReading.ts';
import { BoardEventIngestion }                                      from '../../../adapters/forge-api/BoardEventIngestion.ts';
import { ConversationIngestion }                                    from '../../../adapters/forge-api/ConversationIngestion.ts';
import { BoardDocumentMapUtil }                                     from '../../../adapters/page-api/BoardDocumentMapUtil.ts';
import type { ForgeStreamEvent, ForgeStreamFollow, OverseerAccess } from '../../../lib/forge-client/@types/ForgeClientAnswer.ts';
import { forgeEndpointPathOf }                                      from '../../../lib/forge-client/ForgeClient.ts';
import { JsonValueUtil }                                            from '../../../lib/json-value/JsonValueUtil.ts';
import { BoardRelayAnswers }                                        from '../BoardRelayAnswers.ts';
import type { BoardStreams, RelayedEventMapping }                   from '../BoardStreams.ts';
import { forgeAccessVerdictFor, type ForgeAccessSources }           from '../ForgeAccess.ts';
import { WHOLE_EVENT_KEY }                                          from '../utils/BoardRelayLogUtil.ts';

export interface BoardStreamRouteSources {
  readonly forgeAccess:  ForgeAccessSources;
  readonly boardStreams: BoardStreams;
}

/** What one relayed stream follows: the forge's stream path, how to follow it from a cursor and how each of its events maps. */
interface RelayedForgeStream {
  readonly forgeStreamPath: string;
  readonly follow:          (access: OverseerAccess, after: string | null, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void) => ForgeStreamFollow;
  readonly mapEvent:        (event: ForgeStreamEvent) => RelayedEventMapping;
}

const LAST_EVENT_ID_HEADER = 'last-event-id';
const AFTER_QUERY_PARAMETER = 'after';

const BOARD_EVENT_INGESTION = new BoardEventIngestion();
const CONVERSATION_INGESTION = new ConversationIngestion();

const DROPPED_WHOLE: RelayedEventMapping = { verdict: 'dropped', invalidKeys: [WHOLE_EVENT_KEY] };

function relayedAs(event: ForgeStreamEvent, document: unknown): RelayedEventMapping {
  return { verdict: 'relayed', event: { eventName: event.eventName, data: JSON.stringify(document) } };
}

function droppedFor(reason: DocumentReadingFailure): RelayedEventMapping {
  return { verdict: 'dropped', invalidKeys: reason.invalidKeys };
}

/** The forge's board events carry its internal state, which Gaia never reads: each maps by its name alone, to a change signal. */
function boardEventMappingOf(event: ForgeStreamEvent): RelayedEventMapping {
  const boardEvent = BOARD_EVENT_INGESTION.eventOf(event.eventName);
  return boardEvent === null ? DROPPED_WHOLE : relayedAs(event, BoardDocumentMapUtil.eventDocumentOf(boardEvent));
}

function jobStreamEventMappingOf(event: ForgeStreamEvent): RelayedEventMapping {
  const parsing = JsonValueUtil.parsedValueOf(event.data);
  if (parsing === null) return DROPPED_WHOLE;
  if (event.eventName === 'history') {
    const history = CONVERSATION_INGESTION.historyOf(parsing.parsed);
    return history.entries === null ? droppedFor(history.reason) : relayedAs(event, BoardDocumentMapUtil.historyDocumentOf(history.entries));
  }
  if (event.eventName === 'message') {
    const message = CONVERSATION_INGESTION.messageOf(parsing.parsed);
    return message.entry === null ? droppedFor(message.reason) : relayedAs(event, BoardDocumentMapUtil.messageDocumentOf(message.entry));
  }
  return DROPPED_WHOLE;
}

function profileStreamEventMappingOf(event: ForgeStreamEvent): RelayedEventMapping {
  const parsing = JsonValueUtil.parsedValueOf(event.data);
  if (parsing === null || event.eventName !== 'line') return DROPPED_WHOLE;
  const line = CONVERSATION_INGESTION.profileLineOf(parsing.parsed);
  return line.line === null ? droppedFor(line.reason) : relayedAs(event, BoardDocumentMapUtil.profileLineDocumentOf(line.line));
}

function withAfter(path: string, after: string | null): string {
  return after === null ? path : `${path}?${new URLSearchParams({ [AFTER_QUERY_PARAMETER]: after }).toString()}`;
}

async function relayedStreamAnswerFor(request: Request, trackerId: string, sources: BoardStreamRouteSources, stream: RelayedForgeStream): Promise<Response> {
  const accessVerdict = await forgeAccessVerdictFor(trackerId, sources.forgeAccess);
  if (accessVerdict.verdict === 'refused') return BoardRelayAnswers.relayRefusalAnswerOf(BoardRelayAnswers.relayRefusalOfAccess(accessVerdict.refusal));
  const after = new URL(request.url).searchParams.get(AFTER_QUERY_PARAMETER);
  const lastEventId = request.headers.get(LAST_EVENT_ID_HEADER);
  const opening = await sources.boardStreams.openStream({
    trackerId,
    forgeSystemVersion: accessVerdict.forgeSystemVersion,
    forgeStreamPath:    withAfter(stream.forgeStreamPath, after),
    follow:             (onEvent) => stream.follow(accessVerdict.access, after, lastEventId, onEvent),
    mapEvent:           stream.mapEvent,
  });
  return opening.verdict === 'streaming' ? opening.response : BoardRelayAnswers.relayRefusalAnswerOf(opening.refusal);
}

/** The board's events carry no cursor of their own: a page that reconnects asks from its `Last-Event-ID` alone. */
export function boardEventsAnswerFor(request: Request, trackerId: string, sources: BoardStreamRouteSources): Promise<Response> {
  const { forgeClient } = sources.forgeAccess;
  return relayedStreamAnswerFor(request, trackerId, sources, {
    forgeStreamPath: forgeEndpointPathOf('events'),
    follow:          (access, _after, lastEventId, onEvent) => forgeClient.followEvents(access, lastEventId, onEvent),
    mapEvent:        boardEventMappingOf,
  });
}

export function jobStreamAnswerFor(request: Request, trackerId: string, jobId: string, sources: BoardStreamRouteSources): Promise<Response> {
  const { forgeClient } = sources.forgeAccess;
  return relayedStreamAnswerFor(request, trackerId, sources, {
    forgeStreamPath: forgeEndpointPathOf('jobStream', { jobId }),
    follow:          (access, after, lastEventId, onEvent) => forgeClient.followJobStream(access, jobId, after, lastEventId, onEvent),
    mapEvent:        jobStreamEventMappingOf,
  });
}

export function profileStreamAnswerFor(request: Request, trackerId: string, profileRunId: string, sources: BoardStreamRouteSources): Promise<Response> {
  const { forgeClient } = sources.forgeAccess;
  return relayedStreamAnswerFor(request, trackerId, sources, {
    forgeStreamPath: forgeEndpointPathOf('profileStream', { profileRunId }),
    follow:          (access, after, lastEventId, onEvent) => forgeClient.followProfileStream(access, profileRunId, after, lastEventId, onEvent),
    mapEvent:        profileStreamEventMappingOf,
  });
}
