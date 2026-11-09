/** `GET /api/identity`, which needs no token: the board's tracker id and the code version the Overseer runs. */
import type { OverseerIdentity } from '../@types/BoardStateDocument.ts';
import type { FetchFunction }    from './CommandClient.ts';
import { HTTP_STATUS }           from './constants/HttpStatus.ts';

const IDENTITY_PATH = '/api/identity';
const STARTING_REFUSAL = 'starting';
const STARTING_RETRIES = 10;
const STARTING_RETRY_DELAY_MILLISECONDS = 500;

export interface IdentityFetchOptions {
  readonly waitMilliseconds?: (milliseconds: number) => Promise<void>;
}

function waitInRealTime(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * `null` when the Overseer cannot be reached or answers something that is not an identity. A 503 `starting`, an Overseer whose folder watch
 * has not started yet, is asked again a bounded number of times, since a page opened during the start would otherwise have no identity.
 */
async function fetchIdentity(
  fetchOf: FetchFunction = (input, init) => fetch(input, init),
  options: IdentityFetchOptions = {},
): Promise<OverseerIdentity | null> {
  const waitMilliseconds = options.waitMilliseconds ?? waitInRealTime;
  try {
    for (let retry = 0; ; retry += 1) {
      const response = await fetchOf(IDENTITY_PATH);
      const body = await response.json() as Partial<Record<keyof OverseerIdentity | 'refusal', unknown>>;
      const isStarting = response.status === HTTP_STATUS.SERVICE_UNAVAILABLE && body.refusal === STARTING_REFUSAL;
      if (isStarting && retry < STARTING_RETRIES) {
        await waitMilliseconds(STARTING_RETRY_DELAY_MILLISECONDS);
        continue;
      }
      const { trackerId, project, codeVersion } = body;
      if (typeof trackerId !== 'string' || typeof project !== 'string' || typeof codeVersion !== 'string') return null;
      return { trackerId, project, codeVersion };
    }
  } catch {
    return null;
  }
}

export const IdentityClient = Object.freeze({
  fetchIdentity, IDENTITY_PATH, STARTING_RETRIES, STARTING_RETRY_DELAY_MILLISECONDS
});
