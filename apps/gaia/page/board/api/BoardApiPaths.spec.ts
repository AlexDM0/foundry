/**
 * The relay's addresses as the page names them. What matters: each is the route Gaia's server serves for that endpoint, at the version
 * `GAIA_ENDPOINT_VERSIONS` names, matched by the server's own registry pattern; a tracker id and an item id are encoded once; a stream asks
 * after its cursor only when it has one.
 */
import { describe, expect, test } from 'bun:test';

import { BoardRelayEndpointUtil } from '../../../src/features/page-server/utils/BoardRelayEndpointUtil.ts';
import { ApiPathUtil }            from '../../../src/lib/api-paths/ApiPathUtil.ts';
import { GAIA_ENDPOINT_VERSIONS } from '../../../src/shared/constants/GaiaSystemVersions.ts';
import { BoardApiPaths }          from './BoardApiPaths.ts';

describe('the relay\'s addresses', () => {
  test('each names its route at its version', () => {
    expect([
      BoardApiPaths.boardPathOf('example-tracker'),
      BoardApiPaths.boardEventsPathOf('example-tracker'),
      BoardApiPaths.jobStreamPathOf('example-tracker', 'J12', null),
      BoardApiPaths.profileStreamPathOf('example-tracker', 'P3', 0),
      BoardApiPaths.picturesPathOf('example-tracker'),
      BoardApiPaths.picturePathOf('example-tracker', 'a'.repeat(64)),
      BoardApiPaths.commandsPathOf('example-tracker'),
      BoardApiPaths.ticketDocumentsPathOf('example-tracker', '004'),
    ]).toEqual([
      `/api/v${GAIA_ENDPOINT_VERSIONS.forgeBoard}/forges/example-tracker/board`,
      `/api/v${GAIA_ENDPOINT_VERSIONS.forgeBoardEvents}/forges/example-tracker/board/events`,
      `/api/v${GAIA_ENDPOINT_VERSIONS.forgeJobStream}/forges/example-tracker/jobs/J12/stream`,
      `/api/v${GAIA_ENDPOINT_VERSIONS.forgeProfileStream}/forges/example-tracker/profiles/P3/stream`,
      `/api/v${GAIA_ENDPOINT_VERSIONS.forgePictureUpload}/forges/example-tracker/pictures`,
      `/api/v${GAIA_ENDPOINT_VERSIONS.forgePicture}/forges/example-tracker/pictures/${'a'.repeat(64)}`,
      `/api/v${GAIA_ENDPOINT_VERSIONS.forgeCommands}/forges/example-tracker/commands`,
      `/api/v${GAIA_ENDPOINT_VERSIONS.forgeTicketDocuments}/forges/example-tracker/tickets/004/documents`,
    ]);
  });

  test('each is matched by the server\'s pattern for its endpoint, and gives back the tracker id and item id it was built from', () => {
    const trackerId = 'example tracker/1';
    const endpointOf = (path: string): string => ApiPathUtil.endpointOfPath(path.split('?')[0] ?? '')?.endpoint ?? '';
    const cases = [
      { endpointName: 'board', path: BoardApiPaths.boardPathOf(trackerId), itemId: null },
      { endpointName: 'boardEvents', path: BoardApiPaths.boardEventsPathOf(trackerId), itemId: null },
      { endpointName: 'jobStream', path: BoardApiPaths.jobStreamPathOf(trackerId, 'J12', '1.4'), itemId: 'J12' },
      { endpointName: 'profileStream', path: BoardApiPaths.profileStreamPathOf(trackerId, 'P3', 2), itemId: 'P3' },
      { endpointName: 'pictures', path: BoardApiPaths.picturesPathOf(trackerId), itemId: null },
      { endpointName: 'picture', path: BoardApiPaths.picturePathOf(trackerId, 'b'.repeat(64)), itemId: 'b'.repeat(64) },
      { endpointName: 'commands', path: BoardApiPaths.commandsPathOf(trackerId), itemId: null },
    ] as const;
    for (const { endpointName, path, itemId } of cases) {
      const values = BoardRelayEndpointUtil.valuesOf(endpointName, endpointOf(path));
      expect([endpointName, values?.trackerId, values?.itemId ?? null]).toEqual([endpointName, trackerId, itemId]);
    }
  });

  test('a stream asks after its cursor only when it has one', () => {
    expect(BoardApiPaths.jobStreamPathOf('example-tracker', 'J12', '1.4')).toEndWith('/jobs/J12/stream?after=1.4');
    expect(BoardApiPaths.profileStreamPathOf('example-tracker', 'P3', 2)).toEndWith('/profiles/P3/stream?after=2');
  });
});
