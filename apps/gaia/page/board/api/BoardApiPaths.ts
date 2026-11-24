/**
 * The address of each route of Gaia's relay of one forge's board, at the version `GAIA_ENDPOINT_VERSIONS` names: the board, its event
 * stream, a job's and a gate profile's streams after a cursor, the pictures, the commands and a ticket's documents. Each tracker id and
 * item id is encoded once.
 */
import { ApiPathUtil }            from '../../../src/lib/api-paths/ApiPathUtil.ts';
import { GAIA_ENDPOINT_VERSIONS } from '../../../src/shared/constants/GaiaSystemVersions.ts';

const AFTER_QUERY_PARAMETER = 'after';

function forgeEndpointOf(trackerId: string, below: string): string {
  return `forges/${encodeURIComponent(trackerId)}${below}`;
}

function withAfter(path: string, after: string | null): string {
  return after === null ? path : `${path}?${new URLSearchParams({ [AFTER_QUERY_PARAMETER]: after }).toString()}`;
}

function boardPathOf(trackerId: string): string {
  return ApiPathUtil.versionedPathOf(forgeEndpointOf(trackerId, '/board'), GAIA_ENDPOINT_VERSIONS.forgeBoard);
}

function boardEventsPathOf(trackerId: string): string {
  return ApiPathUtil.versionedPathOf(forgeEndpointOf(trackerId, '/board/events'), GAIA_ENDPOINT_VERSIONS.forgeBoardEvents);
}

/** `after` is the last transcript cursor received; `null` asks for the whole history. */
function jobStreamPathOf(trackerId: string, jobId: string, after: string | null): string {
  const path = ApiPathUtil.versionedPathOf(forgeEndpointOf(trackerId, `/jobs/${encodeURIComponent(jobId)}/stream`), GAIA_ENDPOINT_VERSIONS.forgeJobStream);
  return withAfter(path, after);
}

/** `afterLineNumber` is the last output line received; 0 asks for every line. */
function profileStreamPathOf(trackerId: string, profileRunId: string, afterLineNumber: number): string {
  const endpoint = forgeEndpointOf(trackerId, `/profiles/${encodeURIComponent(profileRunId)}/stream`);
  const path = ApiPathUtil.versionedPathOf(endpoint, GAIA_ENDPOINT_VERSIONS.forgeProfileStream);
  return withAfter(path, afterLineNumber === 0 ? null : String(afterLineNumber));
}

function picturesPathOf(trackerId: string): string {
  return ApiPathUtil.versionedPathOf(forgeEndpointOf(trackerId, '/pictures'), GAIA_ENDPOINT_VERSIONS.forgePictureUpload);
}

function picturePathOf(trackerId: string, pictureId: string): string {
  return ApiPathUtil.versionedPathOf(forgeEndpointOf(trackerId, `/pictures/${encodeURIComponent(pictureId)}`), GAIA_ENDPOINT_VERSIONS.forgePicture);
}

function commandsPathOf(trackerId: string): string {
  return ApiPathUtil.versionedPathOf(forgeEndpointOf(trackerId, '/commands'), GAIA_ENDPOINT_VERSIONS.forgeCommands);
}

function ticketDocumentsPathOf(trackerId: string, ticketId: string): string {
  const endpoint = forgeEndpointOf(trackerId, `/tickets/${encodeURIComponent(ticketId)}/documents`);
  return ApiPathUtil.versionedPathOf(endpoint, GAIA_ENDPOINT_VERSIONS.forgeTicketDocuments);
}

export const BoardApiPaths = {
  boardPathOf,
  boardEventsPathOf,
  jobStreamPathOf,
  profileStreamPathOf,
  picturesPathOf,
  picturePathOf,
  commandsPathOf,
  ticketDocumentsPathOf,
} as const;
