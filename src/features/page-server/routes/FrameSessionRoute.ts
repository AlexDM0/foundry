/**
 * `POST /api/forges/<trackerId>/frame-session` (PLAN 8.3): Gaia asks the forge's Overseer for a one-time session code with the forge's
 * token, and answers the Bridge's address with `?embedded=gaia` and that code in its fragment, which the page sets as the frame's `src`.
 * The token travels only as the bearer of that one request: it reaches no answer and no log line.
 */
import { OverseerTokenFile }                        from '../../../adapters/forge-api/OverseerTokenFile.ts';
import type { RegisteredOverseer }                  from '../../../adapters/forge-registry/@types/RegisteredForge.ts';
import { registeredForgesOf, type RegistryReading } from '../../../adapters/forge-registry/RegistryFile.ts';
import { FrameSessionAnswerMapUtil }                from '../../../adapters/page-api/FrameSessionAnswerMapUtil.ts';
import type { ForgeSessionCodeAnswer }              from '../../../lib/forge-client/@types/ForgeClientAnswer.ts';
import type { ForgeClient }                         from '../../../lib/forge-client/ForgeClient.ts';
import type { ForgeFidelity, ForgeReading }         from '../../../shared/@types/ForgeReading.ts';
import type { FrameSessionVerdict }                 from '../../../shared/@types/FrameSessionVerdict.ts';
import { CONTRACT_VERSIONS }                        from '../../../shared/constants/ContractVersions.ts';

export interface FrameSessionSources {
  /** Read at each request, so the Overseer's address and token file are the ones the registry names now. */
  readonly readRegistry: () => Promise<RegistryReading>;
  /** The forge watch's latest readings: whether an Overseer answers and which embed channel it serves. */
  readonly readings:     () => readonly ForgeReading[];
  readonly forgeClient:  ForgeClient;
}

export const FRAME_SESSION_METHOD = 'POST';

const FRAME_SESSION_PATH = /^\/api\/forges\/([^/]+)\/frame-session$/;

const EMBEDDED_PARAMETER = 'embedded';
const EMBEDDED_FOR_GAIA = 'gaia';

/** The Bridge's own session exchange reads the code from this fragment, as it does for `forge open`. */
const SESSION_CODE_FRAGMENT_PREFIX = 'session=';

/** The fidelities at which the forge's Overseer answered its last read. */
const OVERSEER_ANSWERS_AT: ReadonlySet<ForgeFidelity> = new Set<ForgeFidelity>(['full', 'counts-only', 'newer-contract']);

const HTTP_STATUS_BY_OUTCOME = {
  'done':          200,
  'refused':       409,
  'unreachable':   502,
  'not-supported': 501,
} as const;

/** The tracker id a frame session path names, or `null` for any other path. */
export function trackerIdOfFrameSessionPath(pathname: string): string | null {
  const encodedTrackerId = FRAME_SESSION_PATH.exec(pathname)?.[1];
  if (encodedTrackerId === undefined) return null;
  try {
    return decodeURIComponent(encodedTrackerId);
  } catch {
    return null;
  }
}

function frameUrlOf(overseerUrl: string, sessionCode: string): string {
  const frameUrl = new URL(overseerUrl);
  frameUrl.searchParams.set(EMBEDDED_PARAMETER, EMBEDDED_FOR_GAIA);
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

async function sessionCodeVerdictOf(overseer: RegisteredOverseer, forgeClient: ForgeClient): Promise<FrameSessionVerdict> {
  const bearerToken = overseer.tokenPath === null ? null : await new OverseerTokenFile(overseer.tokenPath).read();
  if (bearerToken === null) return { verdict: 'refused', refusedBy: 'gaia', refusal: 'token-unreadable' };
  return verdictOfSessionCodeAnswer(overseer.url, await forgeClient.sessionCodeOf({ overseerUrl: overseer.url, bearerToken }));
}

/**
 * The contract check comes before the token is read: a forge with no embed channel Gaia knows is asked for nothing. The embed channel
 * checked is the one the watch read, so an Overseer the registry now names at another address is not asked until the watch reads it.
 */
export async function frameSessionVerdictFor(trackerId: string, sources: FrameSessionSources): Promise<FrameSessionVerdict> {
  const forges = registeredForgesOf(await sources.readRegistry());
  if (typeof forges === 'string') return { verdict: 'refused', refusedBy: 'gaia', refusal: forges };
  const forge = forges.find((registered) => registered.trackerId === trackerId);
  if (forge === undefined) return { verdict: 'refused', refusedBy: 'gaia', refusal: 'forge-not-registered' };
  const reading = sources.readings().find((watched) => watched.trackerId === trackerId);
  if (forge.overseer === null || reading === undefined || reading.url !== forge.overseer.url || !OVERSEER_ANSWERS_AT.has(reading.fidelity)) return { verdict: 'unreachable' };
  if (reading.contracts.embed !== CONTRACT_VERSIONS.forgeEmbedChannel) return { verdict: 'not-supported' };
  return sessionCodeVerdictOf(forge.overseer, sources.forgeClient);
}

export async function frameSessionAnswerFor(trackerId: string, sources: FrameSessionSources): Promise<Response> {
  const answerDocument = FrameSessionAnswerMapUtil.answerDocumentOf(await frameSessionVerdictFor(trackerId, sources));
  return Response.json(answerDocument, { status: HTTP_STATUS_BY_OUTCOME[answerDocument.outcome], headers: { 'cache-control': 'no-store' } });
}
