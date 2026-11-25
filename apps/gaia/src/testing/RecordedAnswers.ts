/**
 * The hephaestus-fetch mock every spec uses in place of the real boundary. It answers from the answers recorded from a real forge, or from
 * a program that is no forge, for one situation of the forge, and fails the spec on a call with no answer. It keeps the
 * real boundary's demands on the caller: an address that parses, a bound above zero, and a stream left open is counted until closed.
 * Test-only.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import type {
  AnsweredRequest,
  HephaestusAnswer,
  HephaestusAnswerForm,
  HephaestusByteBody,
  HephaestusFetch,
  HephaestusRequest,
  HephaestusStream,
  HephaestusStreamAnswer,
  HephaestusStreamRequest,
  StreamChunk,
} from '../lib/forge-client/HephaestusFetch.ts';

import {
  boundaryRecordingReadingOf,
  recordCommandOf,
  recordingPathOf,
  repositoryRoot,
} from './BoundaryRecordings.ts';

/**
 * The state of a forge at the version Gaia supports that a set of answers was taken in. `serving` is Example Project, whose summary Gaia
 * polls; `serving-every-contract` is Example Storefront at work; `port-held-by-another-program`, `snapshot-unreadable` and
 * `stream-cut-inside-event` are programs that are no forge; the rest name the one outcome they hold.
 */
export const HEPHAESTUS_SITUATIONS = [
  'serving',
  'serving-every-contract',
  'stopped',
  'not-answering',
  'token-rejected',
  'starting',
  'board-unreadable',
  'command-refused',
  'nothing-to-change',
  'port-held-by-another-program',
  'restart',
  'snapshot-unreadable',
  'stream-cut-inside-event',
  'connection-broken',
  'machine-limit-lowered',
] as const;

export type HephaestusSituation = typeof HEPHAESTUS_SITUATIONS[number];

/**
 * Example Storefront's board as the relay reads it, each situation holding one outcome of a call whose shape another one shares:
 * `board-at-work` the board document and its event stream, from its start and from the first event's id; both refused another's token;
 * a board command applied, refused, of an unknown kind and held for an install change, the board document read in that hold too; a picture
 * accepted and read back, refused as too large and refused as no picture; a product owner's conversation the fake agent plays, after a
 * picture was uploaded for it; a gate profile run's output; the Assistant switched off and on again, each with the command's answer
 * and the board document read after it; a first setup record open at its agent step with no agent chosen; and an intake's product owner
 * standing not launched once the program its agent was pinned to is gone, with User's look again and the board after it.
 */
export const BOARD_SITUATIONS = [
  'board-at-work',
  'board-token-rejected',
  'board-command-applied',
  'board-command-refused',
  'board-command-unknown-kind',
  'board-install-held',
  'picture-accepted',
  'picture-too-large',
  'picture-not-a-picture',
  'intake-conversation',
  'gate-profile-run',
  'assistant-switched-off',
  'assistant-switched-on',
  'setup-choosing-billing',
  'job-not-launched',
] as const;

export type BoardSituation = typeof BOARD_SITUATIONS[number];

/** Example Storefront's presence: serving with no work waiting, a crash log it does not have, and after User started it again after a crash. */
export const PRESENCE_SITUATIONS = [
  'presence-serving',
  'started-after-a-crash',
] as const;

export type PresenceSituation = typeof PRESENCE_SITUATIONS[number];

/**
 * Example Bookshop's board in the spec-then-plan route: `ticket-documents-saved` the save of a draft's spec, which opens its documents, then
 * the board's events up to the `documents` event, the documents and the board read after it; `ticket-documents-absent` a ticket with no
 * documents; `ticket-documents-unknown-ticket` a reference that names no ticket.
 */
export const TICKET_DOCUMENTS_SITUATIONS = [
  'ticket-documents-saved',
  'ticket-documents-absent',
  'ticket-documents-unknown-ticket',
] as const;

export type TicketDocumentsSituation = typeof TICKET_DOCUMENTS_SITUATIONS[number];

/**
 * Forges at another system version than the one Gaia supports: one ahead of it that still serves it, called at its versioned paths; one
 * too new to talk to; one older; and one that serves no `/api/versions`, as every forge before 1.0, which is older too.
 */
export const VERSIONS_SITUATIONS = [
  'versions-ahead',
  'versions-newer',
  'versions-older',
  'versions-absent',
] as const;

export type VersionsSituation = typeof VERSIONS_SITUATIONS[number];

/** `stays-open`: after its chunks the stream sends nothing more and ends only when it is closed. */
export type RecordedStreamEnding = 'closed' | 'broken' | 'stays-open';

/** An answered request as a recording holds it: the bytes of an answer read as bytes in base64, since a recording is JSON. */
export type RecordedRequestAnswer = Omit<AnsweredRequest, 'bodyBytes'> & { readonly bodyBytes: string | null };

export type RecordedAnswerOfRequest = RecordedRequestAnswer | Exclude<HephaestusAnswer, AnsweredRequest>;

/** What a stream sent, chunk by chunk, and how it ended. */
export interface RecordedStream {
  readonly verdict: 'streaming';
  readonly chunks:  readonly string[];
  readonly ending:  RecordedStreamEnding;
}

export type RecordedStreamAnswer = RecordedStream | RecordedAnswerOfRequest;

export interface RecordedHephaestusAnswer {
  readonly callShape: string;
  readonly answer:    RecordedAnswerOfRequest | RecordedStreamAnswer;
}

export interface AnsweredHephaestusCall {
  readonly callShape:   string;
  readonly bearerToken: string | null;
  readonly jsonBody:    string | null;
  readonly byteBody:    HephaestusByteBody | null;
  readonly answerAs:    HephaestusAnswerForm | null;
  readonly lastEventId: string | null;
}

export interface RecordedHephaestusFetch extends HephaestusFetch {
  /** Every call answered so far, in order. */
  readonly callsAnswered:   () => readonly AnsweredHephaestusCall[];
  /** The streams opened and neither read to their end nor closed. */
  readonly streamsLeftOpen: () => number;
}

/**
 * The recordings of a forge at the version Gaia supports and of programs that are no forge.
 * Each situation's call shapes are unique across them.
 */
export const HEPHAESTUS_RECORDING_NAMES = [
  'hephaestus-fetch-supported-forge',
  'hephaestus-fetch-board',
  'hephaestus-fetch-presence',
  'hephaestus-fetch-ticket-documents',
  'hephaestus-fetch-other-programs',
] as const;

/**
 * The recording of forges at another system version than the one Gaia supports: the supported forge answering older, ahead or newer through
 * its test setting `FORGE_VERSIONS_ANSWER`, and a forge from before system versions.
 */
export const VERSIONS_HEPHAESTUS_RECORDING_NAME = 'hephaestus-fetch-versions';

const STREAM_CALL_SHAPE_PREFIX = 'STREAM ';
const BEARER_SUFFIX = ' with bearer';
const LAST_EVENT_ID_SUFFIX = ' from a last event id';
const SITUATION_SEPARATOR = ': ';
const STREAM_ENDINGS: ReadonlySet<unknown> = new Set<RecordedStreamEnding>(['closed', 'broken', 'stays-open']);

/** The address, the token's value and the body are left out: a recorded answer holds for any of them. */
export function requestCallShapeOf(request: Pick<HephaestusRequest, 'method' | 'path' | 'bearerToken'>): string {
  return `${request.method} ${request.path}${request.bearerToken === null ? '' : BEARER_SUFFIX}`;
}

/** The last event id's value is left out too: a reconnect's answer holds for any id the stream sent. */
export function streamCallShapeOf(request: Pick<HephaestusStreamRequest, 'path' | 'bearerToken' | 'lastEventId'>): string {
  const bearer = request.bearerToken === null ? '' : BEARER_SUFFIX;
  return `${STREAM_CALL_SHAPE_PREFIX}${request.path}${bearer}${request.lastEventId === null ? '' : LAST_EVENT_ID_SUFFIX}`;
}

export type RecordedSituation = HephaestusSituation | VersionsSituation | BoardSituation | PresenceSituation | TicketDocumentsSituation;

export function situationCallShapeOf(situation: RecordedSituation, callShape: string): string {
  return `${situation}${SITUATION_SEPARATOR}${callShape}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTextOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isHephaestusAnswer(answer: unknown): answer is RecordedAnswerOfRequest {
  if (!isRecord(answer)) return false;
  if (answer['verdict'] === 'unreachable' || answer['verdict'] === 'timed-out') return true;
  return answer['verdict'] === 'answered' && Number.isInteger(answer['status']) && typeof answer['bodyText'] === 'string'
    && isTextOrNull(answer['contentType']) && isTextOrNull(answer['bodyBytes']);
}

/** The answer as a recording holds it: the bytes of an answer read as bytes in base64. */
export function recordedFormOf(answer: HephaestusAnswer | RecordedStream): RecordedStreamAnswer {
  if (answer.verdict !== 'answered') return answer;
  return { ...answer, bodyBytes: answer.bodyBytes === null ? null : Buffer.from(answer.bodyBytes).toString('base64') };
}

function answerOfRecordedForm(answer: RecordedAnswerOfRequest): HephaestusAnswer {
  if (answer.verdict !== 'answered') return answer;
  return { ...answer, bodyBytes: answer.bodyBytes === null ? null : new Uint8Array(Buffer.from(answer.bodyBytes, 'base64')) };
}

function isRecordedStreamAnswer(answer: unknown): answer is RecordedStreamAnswer {
  if (isHephaestusAnswer(answer)) return true;
  if (!isRecord(answer) || answer['verdict'] !== 'streaming') return false;
  const { chunks, ending } = answer;
  return Array.isArray(chunks) && chunks.every((chunk) => typeof chunk === 'string') && STREAM_ENDINGS.has(ending);
}

function callShapeWithoutSituation(callShape: string): string {
  const separatorIndex = callShape.indexOf(SITUATION_SEPARATOR);
  return separatorIndex === -1 ? callShape : callShape.slice(separatorIndex + SITUATION_SEPARATOR.length);
}

function answerFitsCallShape(callShape: string, answer: unknown): boolean {
  return callShapeWithoutSituation(callShape).startsWith(STREAM_CALL_SHAPE_PREFIX) ? isRecordedStreamAnswer(answer) : isHephaestusAnswer(answer);
}

function answersOfRecording(recordingName: string, operatingSystem: string): readonly RecordedHephaestusAnswer[] {
  const recordingPath = recordingPathOf(recordingName, operatingSystem);
  const remedy        = `Record it with \`${recordCommandOf(recordingName)}\`.`;
  let recordingText: string;
  try {
    recordingText = readFileSync(join(repositoryRoot(), recordingPath), 'utf8');
  } catch {
    throw new Error(`${recordingName} has no recording for ${operatingSystem} at ${recordingPath}. ${remedy}`);
  }
  const reading = boundaryRecordingReadingOf(recordingText);
  if (reading.verdict === 'unreadable') throw new Error(`${recordingPath} is unreadable: ${reading.reason}. ${remedy}`);
  return reading.recording.answers.map(({ callShape, answer }) => {
    if (!answerFitsCallShape(callShape, answer)) throw new Error(`${recordingPath} holds no hephaestus-fetch answer for ${callShape}. ${remedy}`);
    return { callShape, answer } as RecordedHephaestusAnswer;
  });
}

/** Every answer of the recordings `HEPHAESTUS_RECORDING_NAMES` names for an OS, each call shape still led by its situation. */
export function everyRecordedHephaestusAnswerOf(operatingSystem: string = process.platform): readonly RecordedHephaestusAnswer[] {
  return HEPHAESTUS_RECORDING_NAMES.flatMap((recordingName) => answersOfRecording(recordingName, operatingSystem));
}

/** Every answer of the versions recording for an OS, each call shape still led by its situation. */
export function everyRecordedVersionsAnswerOf(operatingSystem: string = process.platform): readonly RecordedHephaestusAnswer[] {
  return answersOfRecording(VERSIONS_HEPHAESTUS_RECORDING_NAME, operatingSystem);
}

function answersOfSituation(answers: readonly RecordedHephaestusAnswer[], situation: RecordedSituation): readonly RecordedHephaestusAnswer[] {
  const situationPrefix = situationCallShapeOf(situation, '');
  return answers
    .filter(({ callShape }) => callShape.startsWith(situationPrefix))
    .map(({ callShape, answer }) => ({ callShape: callShape.slice(situationPrefix.length), answer }));
}

/** The answers of one situation, from every recording `HEPHAESTUS_RECORDING_NAMES` names, each call shape without its situation. */
export function recordedHephaestusAnswersOf(situation: HephaestusSituation, operatingSystem: string = process.platform): readonly RecordedHephaestusAnswer[] {
  return answersOfSituation(everyRecordedHephaestusAnswerOf(operatingSystem), situation);
}

/** The answers of one situation of Example Storefront's board, each call shape without its situation. */
export function recordedBoardAnswersOf(situation: BoardSituation, operatingSystem: string = process.platform): readonly RecordedHephaestusAnswer[] {
  return answersOfSituation(everyRecordedHephaestusAnswerOf(operatingSystem), situation);
}

/** The answers of one situation of Example Storefront's presence, each call shape without its situation. */
export function recordedPresenceAnswersOf(situation: PresenceSituation, operatingSystem: string = process.platform): readonly RecordedHephaestusAnswer[] {
  return answersOfSituation(everyRecordedHephaestusAnswerOf(operatingSystem), situation);
}

/** The answers of one situation of Example Bookshop's ticket documents, each call shape without its situation. */
export function recordedTicketDocumentsAnswersOf(situation: TicketDocumentsSituation, operatingSystem: string = process.platform): readonly RecordedHephaestusAnswer[] {
  return answersOfSituation(everyRecordedHephaestusAnswerOf(operatingSystem), situation);
}

/** The answers of one forge at another system version, each call shape without its situation. */
export function recordedVersionsAnswersOf(situation: VersionsSituation, operatingSystem: string = process.platform): readonly RecordedHephaestusAnswer[] {
  return answersOfSituation(everyRecordedVersionsAnswerOf(operatingSystem), situation);
}

function recordedStreamOf(chunks: readonly string[], ending: RecordedStreamEnding): { readonly stream: HephaestusStream; readonly isLeftOpen: () => boolean } {
  const chunksLeft = [...chunks];
  let isClosed     = false;
  let endWasRead   = false;
  let wakeOnClose: (() => void) | null = null;

  async function nextChunk(): Promise<StreamChunk> {
    const chunk = isClosed ? undefined : chunksLeft.shift();
    if (chunk !== undefined) return { kind: 'text', text: chunk };
    if (!isClosed && ending === 'stays-open') await new Promise<void>((resolve) => { wakeOnClose = resolve; });
    endWasRead = true;
    return { kind: 'ended', ending: isClosed || ending === 'stays-open' ? 'closed' : ending };
  }

  function close(): void {
    isClosed = true;
    wakeOnClose?.();
  }

  return { stream: { nextChunk, close }, isLeftOpen: () => !isClosed && !endWasRead };
}

export function recordedHephaestusFetch(recordedAnswers: readonly RecordedHephaestusAnswer[]): RecordedHephaestusFetch {
  const answerByCallShape = new Map<string, RecordedHephaestusAnswer['answer']>();
  for (const { callShape, answer } of recordedAnswers) {
    if (answerByCallShape.has(callShape)) throw new Error(`Two recorded answers for ${callShape}: a flow takes one answer set per stage.`);
    if (!answerFitsCallShape(callShape, answer)) throw new Error(`The answer recorded for ${callShape} is no hephaestus-fetch answer for that call.`);
    answerByCallShape.set(callShape, answer);
  }
  const callsAnswered: AnsweredHephaestusCall[] = [];
  const openedStreams: { readonly isLeftOpen: () => boolean }[] = [];

  function recordedAnswerFor(call: AnsweredHephaestusCall, hephaestusUrl: string, timeoutMilliseconds: number) {
    const { callShape } = call;
    if (!URL.canParse(hephaestusUrl)) throw new Error(`${callShape} was sent to ${hephaestusUrl}, which is no address; the real boundary throws there.`);
    if (!(timeoutMilliseconds > 0)) throw new Error(`${callShape} was sent with the bound ${timeoutMilliseconds}; the real boundary times out at once.`);
    if (call.jsonBody !== null && call.byteBody !== null) throw new Error(`${callShape} was sent with a JSON body and a byte body; the real boundary throws there.`);
    const answer = answerByCallShape.get(callShape);
    if (answer === undefined) {
      const recordedShapes = [...answerByCallShape.keys()].map((recordedShape) => `  ${recordedShape}`).join('\n');
      throw new Error(`No recorded answer for ${callShape}. The recorded call shapes are:\n${recordedShapes}`);
    }
    const answeredAsBytes = answer.verdict === 'answered' && answer.bodyBytes !== null;
    if (call.answerAs !== null && answer.verdict === 'answered' && answeredAsBytes !== (call.answerAs === 'bytes')) {
      throw new Error(`${callShape} asks its answer as ${call.answerAs}, and the answer was recorded as ${answeredAsBytes ? 'bytes' : 'text'}.`);
    }
    callsAnswered.push(call);
    return answer;
  }

  return {
    request: async (hephaestusRequest: HephaestusRequest) => {
      const {
        hephaestusUrl, timeoutMilliseconds, bearerToken, jsonBody, byteBody, answerAs
      } = hephaestusRequest;
      const call: AnsweredHephaestusCall = {
        callShape: requestCallShapeOf(hephaestusRequest), bearerToken, jsonBody, byteBody, answerAs, lastEventId: null,
      };
      return answerOfRecordedForm(recordedAnswerFor(call, hephaestusUrl, timeoutMilliseconds) as RecordedAnswerOfRequest);
    },
    openStream: async (streamRequest: HephaestusStreamRequest): Promise<HephaestusStreamAnswer> => {
      const {
        hephaestusUrl, timeoutMilliseconds, bearerToken, lastEventId
      } = streamRequest;
      const call: AnsweredHephaestusCall = {
        callShape: streamCallShapeOf(streamRequest), bearerToken, jsonBody: null, byteBody: null, answerAs: null, lastEventId,
      };
      const answer = recordedAnswerFor(call, hephaestusUrl, timeoutMilliseconds) as RecordedStreamAnswer;
      if (answer.verdict !== 'streaming') return answerOfRecordedForm(answer);
      const recordedStream = recordedStreamOf(answer.chunks, answer.ending);
      openedStreams.push(recordedStream);
      return { verdict: 'streaming', stream: recordedStream.stream };
    },
    callsAnswered:   () => [...callsAnswered],
    streamsLeftOpen: () => openedStreams.filter((openedStream) => openedStream.isLeftOpen()).length,
  };
}
