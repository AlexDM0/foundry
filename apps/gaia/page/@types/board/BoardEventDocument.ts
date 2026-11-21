/**
 * One event of a forge's board stream as Gaia relays it to the page, under the forge's event name and id. Every event is a change signal:
 * `board-changed` asks the page to read the board anew, and a part event names the part that changed, which a `board-changed` of the same
 * pass always follows.
 */
import type { PAGE_CONTRACT_VERSIONS } from '../../../src/shared/constants/PageContractVersions.ts';

export type BoardPartName = 'job' | 'decision' | 'incident' | 'overseer' | 'usage' | 'profile' | 'pipeline';

export type BoardEventDocument = { readonly boardVersion: typeof PAGE_CONTRACT_VERSIONS.gaiaBoard } & (
  | { readonly kind: 'board-changed' }
  | { readonly kind: 'part-changed'; readonly part: BoardPartName }
);
