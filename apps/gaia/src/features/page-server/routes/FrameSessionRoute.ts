/**
 * `POST /api/forges/<trackerId>/frame-session` (PLAN 8.3): Gaia asks the forge's Overseer for a one-time session code with the forge's
 * token, and answers the Bridge's address in forge's embed mode, `?embedded=frame`, with that code in its fragment, which the page sets as
 * the frame's `src`.
 * The token travels only as the bearer of that one request: it reaches no answer and no log line.
 */
import { EMBED_MODE_QUERY } from 'forge-contracts/EmbedMode';

import { PageAnswerMapUtil }           from '../../../adapters/page-api/PageAnswerMapUtil.ts';
import type { ForgeSessionCodeAnswer } from '../../../lib/forge-client/@types/ForgeClientAnswer.ts';
import type { FrameSessionVerdict }    from '../../../shared/@types/FrameSessionVerdict.ts';
import { CONTRACT_VERSIONS }           from '../../../shared/constants/ContractVersions.ts';
import {
  accessVerdictOf,
  watchedOverseerVerdictFor,
  type ForgeAccessRefusal,
  type ForgeAccessSources,
} from '../ForgeAccess.ts';

export type FrameSessionSources = ForgeAccessSources;

export const FRAME_SESSION_METHOD = 'POST';

const FRAME_SESSION_ENDPOINT = /^forges\/([^/]+)\/frame-session$/;


/** The Bridge's own session exchange reads the code from this fragment, as it does for `forge open`. */
const SESSION_CODE_FRAGMENT_PREFIX = 'session=';

const HTTP_STATUS_BY_OUTCOME = {
  'done':          200,
  'refused':       409,
  'unreachable':   502,
  'not-supported': 501,
} as const;

/** The tracker id a frame session endpoint names (`forges/<trackerId>/frame-session`, below `/api/` and its version), or `null` for any other. */
export function trackerIdOfFrameSessionEndpoint(endpoint: string): string | null {
  const encodedTrackerId = FRAME_SESSION_ENDPOINT.exec(endpoint)?.[1];
  if (encodedTrackerId === undefined) return null;
  try {
    return decodeURIComponent(encodedTrackerId);
  } catch {
    return null;
  }
}

function frameUrlOf(overseerUrl: string, sessionCode: string): string {
  const frameUrl = new URL(overseerUrl);
  frameUrl.searchParams.set(EMBED_MODE_QUERY.parameter, EMBED_MODE_QUERY.value);
  frameUrl.hash = `${SESSION_CODE_FRAGMENT_PREFIX}${sessionCode}`;
  return frameUrl.href;
}

function verdictOfSessionCodeAnswer(overseerUrl: string, answer: ForgeSessionCodeAnswer): FrameSessionVerdict {
  switch (answer.verdict) {
    case 'answered':
      return { verdict: 'opened', frameUrl: frameUrlOf(overseerUrl, answer.code) };
    case 'unreachable':
      return { verdict: 'unreachable' };
    case 'unauthorized':
      return { verdict: 'refused', refusedBy: 'gaia', refusal: 'token-rejected' };
    case 'refused':
      return {
        verdict: 'refused', refusedBy: 'forge', refusal: answer.refusal, text: answer.text,
      };
    case 'malformed':
      return { verdict: 'not-supported' };
  }
}

function verdictOfAccessRefusal(refusal: ForgeAccessRefusal): FrameSessionVerdict {
  if (refusal === 'forge-unreachable') return { verdict: 'unreachable' };
  if (refusal === 'forge-version-unsupported') return { verdict: 'not-supported' };
  return { verdict: 'refused', refusedBy: 'gaia', refusal };
}

/** The contract check comes before the token is read: a forge with no embed channel Gaia knows is asked for nothing. */
export async function frameSessionVerdictFor(trackerId: string, sources: FrameSessionSources): Promise<FrameSessionVerdict> {
  const watched = await watchedOverseerVerdictFor(trackerId, sources);
  if (watched.verdict === 'refused') return verdictOfAccessRefusal(watched.refusal);
  if (watched.reading.contracts.embed !== CONTRACT_VERSIONS.forgeEmbedChannel) return { verdict: 'not-supported' };
  const accessVerdict = await accessVerdictOf(watched.overseer, watched.forgeSystemVersion);
  if (accessVerdict.verdict === 'refused') return verdictOfAccessRefusal(accessVerdict.refusal);
  const { access } = accessVerdict;
  return verdictOfSessionCodeAnswer(access.overseerUrl, await sources.forgeClient.sessionCodeOf(access));
}

export async function frameSessionAnswerFor(trackerId: string, sources: FrameSessionSources): Promise<Response> {
  const answerDocument = PageAnswerMapUtil.frameSessionAnswerOf(await frameSessionVerdictFor(trackerId, sources));
  return Response.json(answerDocument, { status: HTTP_STATUS_BY_OUTCOME[answerDocument.outcome], headers: { 'cache-control': 'no-store' } });
}
