/**
 * Asks Gaia's server for a frame session of one forge (`POST /api/forges/<trackerId>/frame-session`, PLAN 8.3) and reads its answer at
 * the known `frameSessionVersion`. The request carries only the page's own session cookie; the forge's token stays in the server, and the
 * one-time code comes back only inside the frame's address.
 */
import { ApiPathUtil }                                          from '../../../src/lib/api-paths/ApiPathUtil.ts';
import { CONTRACT_VERSIONS }                                    from '../../../src/shared/constants/ContractVersions.ts';
import { GAIA_ENDPOINT_VERSIONS }                               from '../../../src/shared/constants/GaiaSystemVersions.ts';
import { ContractVersionUtil }                                  from '../../../src/shared/utils/ContractVersionUtil.ts';
import type { FrameSessionAnswerDocument, FrameSessionOutcome } from '../../@types/FrameSessionDocument.ts';

/** `opened` carries the frame's address and the origin its messages must come from; the others say why there is no frame. */
export type FrameSessionResult =
  | { readonly verdict: 'opened'; readonly frameUrl: string; readonly frameOrigin: string }
  | { readonly verdict: 'not-supported' }
  | { readonly verdict: 'unreachable' }
  | { readonly verdict: 'refused'; readonly refusal: string; readonly text: string | null }
  | { readonly verdict: 'server-unreachable' }
  | { readonly verdict: 'answer-not-understood' };

export type FrameSessionRequestSender = (path: string, requestOptions: RequestInit) => Promise<Response>;

const FRAME_SESSION_OUTCOMES: ReadonlySet<unknown> = new Set<FrameSessionOutcome>(['done', 'refused', 'unreachable', 'not-supported']);

/** The Bridge is served over plain HTTP on 127.0.0.1; Gaia's own CSP frames nothing else. */
const FRAMEABLE_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

function frameSessionPathOf(trackerId: string): string {
  return ApiPathUtil.versionedPathOf(`forges/${encodeURIComponent(trackerId)}/frame-session`, GAIA_ENDPOINT_VERSIONS.frameSession);
}

function fieldOf(body: object, key: string): unknown {
  return Object.hasOwn(body, key) ? (body as Readonly<Record<string, unknown>>)[key] : undefined;
}

function nullableStringIsIn(body: object, key: string): boolean {
  const value = fieldOf(body, key);
  return value === null || typeof value === 'string';
}

const FRAME_SESSION_VERSION_KEYS = { majorKey: 'frameSessionVersion' } as const;

/** Gaia's answer at the known `frameSessionVersion`, or `null` for anything else. */
function answerDocumentOf(body: unknown): FrameSessionAnswerDocument | null {
  if (typeof body !== 'object' || body === null) return null;
  const versionIsKnown = ContractVersionUtil.readMajorOf(body, FRAME_SESSION_VERSION_KEYS, CONTRACT_VERSIONS.gaiaFrameSession) !== null;
  if (!versionIsKnown || !FRAME_SESSION_OUTCOMES.has(fieldOf(body, 'outcome'))) return null;
  if (!nullableStringIsIn(body, 'frameUrl') || !nullableStringIsIn(body, 'refusal') || !nullableStringIsIn(body, 'text')) return null;
  return body as FrameSessionAnswerDocument;
}

/** The origin of an address the page may frame, or `null` for one that does not parse or is not served over HTTP. */
function frameOriginOf(frameUrl: string): string | null {
  try {
    const address = new URL(frameUrl);
    return FRAMEABLE_PROTOCOLS.has(address.protocol) ? address.origin : null;
  } catch {
    return null;
  }
}

function resultOfAnswer(answer: FrameSessionAnswerDocument): FrameSessionResult {
  switch (answer.outcome) {
    case 'done': {
      const frameOrigin = answer.frameUrl === null ? null : frameOriginOf(answer.frameUrl);
      return answer.frameUrl === null || frameOrigin === null ? { verdict: 'answer-not-understood' } : { verdict: 'opened', frameUrl: answer.frameUrl, frameOrigin };
    }
    case 'refused':
      return { verdict: 'refused', refusal: answer.refusal ?? answer.outcome, text: answer.text };
    case 'unreachable':
    case 'not-supported':
      return { verdict: answer.outcome };
  }
}

/** The answer is read whatever the HTTP status: the server maps its verdict to a status and still answers the whole document. */
async function requestFrameSession(sendRequest: FrameSessionRequestSender, trackerId: string): Promise<FrameSessionResult> {
  let response: Response;
  try {
    response = await sendRequest(frameSessionPathOf(trackerId), { method: 'POST', credentials: 'same-origin' });
  } catch {
    return { verdict: 'server-unreachable' };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { verdict: 'answer-not-understood' };
  }
  const answer = answerDocumentOf(body);
  return answer === null ? { verdict: 'answer-not-understood' } : resultOfAnswer(answer);
}

export const FrameSessionRequest = {
  frameSessionPathOf,
  requestFrameSession,
} as const;
