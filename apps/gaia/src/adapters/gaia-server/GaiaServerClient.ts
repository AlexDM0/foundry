/**
 * Asks Gaia's own server on a port of 127.0.0.1, as another process of the same user does: whether Gaia serves there and how far it is
 * with its forges, and, with Gaia's token, a one-time session code for a window. Every answer is a verdict; nothing answering is one. It
 * calls each route at the versioned path this Gaia knows, and at its unversioned path when the server is a Gaia from before versioned paths.
 */
import { ApiPathUtil }                                         from '../../lib/api-paths/ApiPathUtil.ts';
import { GAIA_ENDPOINT_VERSIONS }                              from '../../shared/constants/GaiaSystemVersions.ts';
import { answerIsGaiaHealth, forgeCountsOf, type ForgeCounts } from './HealthDocument.ts';

export type HealthReading =
  /** `forgeCounts` is `null` for a Gaia at another health version, which is still a Gaia on the port. */
  | { readonly verdict: 'gaia-answers'; readonly forgeCounts: ForgeCounts | null }
  | { readonly verdict: 'another-program-answers' }
  | { readonly verdict: 'nothing-answers' };

export type HealthProbeVerdict = HealthReading['verdict'];

export type SessionCodeAnswer =
  | { readonly verdict: 'issued'; readonly code: string }
  | { readonly verdict: 'refused'; readonly status: number }
  | { readonly verdict: 'unreachable' };

export interface GaiaServerClient {
  readonly healthReadingFor: (port: number) => Promise<HealthReading>;
  readonly sessionCodeFor:   (port: number, token: string) => Promise<SessionCodeAnswer>;
}

/** A Gaia from before versioned paths answers a versioned one as any unknown path. */
const NOT_FOUND_STATUS = 404;

/** A Gaia that is up answers its health at once; one that takes longer is treated as absent, and the port then decides. */
export const HEALTH_PROBE_TIMEOUT_MILLISECONDS = 1_000;

/** A session code is issued from memory at once; a server that takes longer is not answering. */
export const SESSION_CODE_TIMEOUT_MILLISECONDS = 2_000;

const SESSION_CODE_PATTERN = /^[0-9a-f]+$/;

function addressOf(port: number, path: string): string {
  return `http://127.0.0.1:${port}${path}`;
}

/** The answer at the endpoint's versioned path, or, where the server knows no such path, at its unversioned one. */
async function versionedFetch(port: number, endpoint: string, version: number, init: RequestInit): Promise<Response> {
  const response = await fetch(addressOf(port, ApiPathUtil.versionedPathOf(endpoint, version)), init);
  if (response.status !== NOT_FOUND_STATUS) return response;
  await response.body?.cancel();
  return fetch(addressOf(port, ApiPathUtil.unversionedPathOf(endpoint)), init);
}

export async function healthReadingFor(port: number, timeoutMilliseconds = HEALTH_PROBE_TIMEOUT_MILLISECONDS): Promise<HealthReading> {
  let response: Response;
  try {
    response = await versionedFetch(port, 'health', GAIA_ENDPOINT_VERSIONS.health, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMilliseconds) });
  } catch {
    return { verdict: 'nothing-answers' };
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return { verdict: 'another-program-answers' };
  }
  return answerIsGaiaHealth(parsed) ? { verdict: 'gaia-answers', forgeCounts: forgeCountsOf(parsed) } : { verdict: 'another-program-answers' };
}

export async function healthProbeVerdictFor(port: number, timeoutMilliseconds = HEALTH_PROBE_TIMEOUT_MILLISECONDS): Promise<HealthProbeVerdict> {
  return (await healthReadingFor(port, timeoutMilliseconds)).verdict;
}

function issuedCodeIn(parsed: unknown): string | null {
  if (typeof parsed !== 'object' || parsed === null || !Object.hasOwn(parsed, 'code')) return null;
  const { code } = parsed as { readonly code: unknown };
  return typeof code === 'string' && SESSION_CODE_PATTERN.test(code) ? code : null;
}

/** The token travels only as a bearer to 127.0.0.1; the code is for one window and buys one session. */
export async function sessionCodeFor(port: number, token: string, timeoutMilliseconds = SESSION_CODE_TIMEOUT_MILLISECONDS): Promise<SessionCodeAnswer> {
  let response: Response;
  try {
    response = await versionedFetch(port, 'session-codes', GAIA_ENDPOINT_VERSIONS.sessionCodes, {
      method:   'POST',
      headers:  { authorization: `Bearer ${token}` },
      redirect: 'manual',
      signal:   AbortSignal.timeout(timeoutMilliseconds),
    });
  } catch {
    return { verdict: 'unreachable' };
  }
  // A body that is no JSON is a refusal at the answer's status, not a server that cannot be reached.
  const parsed: unknown = response.ok ? await response.json().catch(() => null) : null;
  const code = issuedCodeIn(parsed);
  return code === null ? { verdict: 'refused', status: response.status } : { verdict: 'issued', code };
}

export function realGaiaServerClient(): GaiaServerClient {
  return {
    healthReadingFor: (port) => healthReadingFor(port),
    sessionCodeFor:   (port, token) => sessionCodeFor(port, token),
  };
}
