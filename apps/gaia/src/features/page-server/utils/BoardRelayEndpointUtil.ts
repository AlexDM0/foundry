/**
 * The endpoints of Gaia's relay of a forge's board, below `/api/` and its version: each names the forge by its tracker id, percent-decoded
 * once, and some an item of it, a job, a profile run, a picture, a crash log or a ticket, whose id must be one the forge's path template takes.
 */
import { GAIA_ENDPOINTS } from '../../../shared/constants/GaiaCompatibilityRegistry.ts';

/** The relay's endpoints are the registry's endpoints of one forge, `forgeBoard` to `forgeTicketDocuments`. */
export type BoardRelayEndpointName = Extract<keyof typeof GAIA_ENDPOINTS, `forge${string}`>;

export interface BoardRelayEndpointValues {
  readonly trackerId: string;
  /** The job, profile run, picture, crash log or ticket the endpoint names; `null` for an endpoint that names the forge alone. */
  readonly itemId:    string | null;
}

const PLACEHOLDER = /<[^>]+>/g;
const REGULAR_EXPRESSION_SPECIAL_CHARACTER = /[.*+?^${}()|[\]\\]/g;

/** The registry's path, such as `forges/<trackerId>/jobs/<jobId>/stream`, with each placeholder taking one segment. */
function endpointPatternOf(endpointPath: string): RegExp {
  const literalParts = endpointPath.split(PLACEHOLDER).map((part) => part.replace(REGULAR_EXPRESSION_SPECIAL_CHARACTER, '\\$&'));
  return new RegExp(`^${literalParts.join('([^/]+)')}$`);
}

const RELAY_ENDPOINT_PATTERNS = new Map(Object.entries(GAIA_ENDPOINTS).map(([endpointName, endpointPath]) => [endpointName, endpointPatternOf(endpointPath)]));

/** A segment a forge's path template takes, and never `.` or `..`, which would move the forge's path up a folder. */
const ITEM_ID = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;

function decodedOf(encoded: string): string | null {
  try {
    const decoded = decodeURIComponent(encoded);
    return decoded === '' ? null : decoded;
  } catch {
    return null;
  }
}

/** The tracker id and item an endpoint names, or `null` for an endpoint that is not this one or names no forge or item Gaia may ask for. */
function valuesOf(endpointName: BoardRelayEndpointName, endpoint: string): BoardRelayEndpointValues | null {
  const match = RELAY_ENDPOINT_PATTERNS.get(endpointName)?.exec(endpoint) ?? null;
  const encodedTrackerId = match?.[1];
  if (match === null || encodedTrackerId === undefined) return null;
  const trackerId = decodedOf(encodedTrackerId);
  if (trackerId === null) return null;
  const encodedItemId = match[2];
  if (encodedItemId === undefined) return { trackerId, itemId: null };
  const itemId = decodedOf(encodedItemId);
  return itemId !== null && ITEM_ID.test(itemId) ? { trackerId, itemId } : null;
}

function matches(endpointName: BoardRelayEndpointName): (endpoint: string) => boolean {
  return (endpoint) => valuesOf(endpointName, endpoint) !== null;
}

export const BoardRelayEndpointUtil = {
  valuesOf,
  matches,
} as const;
