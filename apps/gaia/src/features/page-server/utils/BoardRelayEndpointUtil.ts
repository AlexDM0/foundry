/**
 * The endpoints of Gaia's relay of a forge's board, below `/api/` and its version: each names the forge by its tracker id, percent-decoded
 * once, and some an item of it, a job, a profile run or a picture, whose id must be one the forge's path template takes.
 */
export type BoardRelayEndpointName = 'board' | 'boardEvents' | 'jobStream' | 'profileStream' | 'pictures' | 'picture' | 'commands';

export interface BoardRelayEndpointValues {
  readonly trackerId: string;
  /** The job, profile run or picture the endpoint names; `null` for an endpoint that names the forge alone. */
  readonly itemId:    string | null;
}

const BOARD_RELAY_ENDPOINT_PATTERNS: Readonly<Record<BoardRelayEndpointName, RegExp>> = {
  board:         /^forges\/([^/]+)\/board$/,
  boardEvents:   /^forges\/([^/]+)\/board\/events$/,
  jobStream:     /^forges\/([^/]+)\/jobs\/([^/]+)\/stream$/,
  profileStream: /^forges\/([^/]+)\/profiles\/([^/]+)\/stream$/,
  pictures:      /^forges\/([^/]+)\/pictures$/,
  picture:       /^forges\/([^/]+)\/pictures\/([^/]+)$/,
  commands:      /^forges\/([^/]+)\/commands$/,
};

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
  const match = BOARD_RELAY_ENDPOINT_PATTERNS[endpointName].exec(endpoint);
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
