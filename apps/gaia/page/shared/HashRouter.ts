/**
 * Gaia's routes are hash fragments, so the page needs no server route and a link survives a server restart. A forge's board is
 * `#forge/<trackerId>[/<place>[/<item segments>]]`, each segment encoded; a path after the tracker id that names no board place opens the
 * forge at its default tab, and an old link's place is redirected to the route it names (`BoardRouter`). Any fragment Gaia does not know
 * is Attention.
 */
import type { FleetDocumentBoardRoute } from '../@types/FleetDocument.ts';
import { BoardRouter, type BoardRoute } from './BoardRouter.ts';

export type GaiaRoute =
  | { readonly view: 'attention' }
  | { readonly view: 'agents'; readonly selectedAgent: SelectedAgent | null; readonly query: string }
  | { readonly view: 'activity' }
  | { readonly view: 'forges'; readonly addingARepository: boolean; readonly forgeInView: string | null }
  | { readonly view: 'forge'; readonly trackerId: string; readonly boardRoute: BoardRoute | null };

export type GaiaView = GaiaRoute['view'];

export interface SelectedAgent {
  readonly trackerId: string;
  readonly jobId:     string;
}

/** Where the page reads its fragment, hears it change and changes it, so a spec can drive each. */
export interface HashSurroundings {
  readonly currentFragment: () => string;
  readonly followFragment:  (listener: () => void) => () => void;
  readonly goTo:            (fragment: string) => void;
  /** Puts a fragment in place of the current one without a new history entry, so Back never returns to a redirected link. */
  readonly replaceFragment: (fragment: string) => void;
}

export const DEFAULT_ROUTE: GaiaRoute = { view: 'attention' };

const ADD_A_REPOSITORY_SEGMENT = 'add';
const FORGE_IN_VIEW_PARAMETER = 'forge';
const QUERY_SEPARATOR = '?';
const PATH_SEPARATOR = '/';
const FRAGMENT_MARK = '#';
const FORGE_PREFIX = `forge${PATH_SEPARATOR}`;
const PROGRESS_PLACE = 'progress';

/** A segment that does not decode, such as a lone `%`, reads as no segment. */
function decodedSegmentOf(segment: string | undefined): string | null {
  if (segment === undefined || segment === '') return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** A malformed segment reads as none: the whole item, or after a Progress view's segment the item after it. */
function readablePlaceSegmentsOf(placeName: string, decodedItemSegments: readonly (string | null)[]): string[] {
  const readableSegments = decodedItemSegments.filter((segment) => segment !== null);
  if (readableSegments.length === decodedItemSegments.length) return readableSegments;
  const [viewSegment] = decodedItemSegments;
  return placeName === PROGRESS_PLACE && BoardRouter.isProgressView(viewSegment) ? [viewSegment] : [];
}

/** The board's part of a forge's path; a malformed item segment reads as no item, and a path naming no board place as no route. */
function boardRouteOf(segments: readonly string[]): BoardRoute | null {
  const [placeName = '', ...itemSegments] = segments;
  return BoardRouter.routeOfPlace(placeName, readablePlaceSegmentsOf(placeName, itemSegments.map(decodedSegmentOf)));
}

function forgeRouteOf(afterView: string): GaiaRoute {
  const [trackerSegment, ...boardSegments] = afterView.split(PATH_SEPARATOR);
  const trackerId = decodedSegmentOf(trackerSegment);
  if (trackerId === null) return DEFAULT_ROUTE;
  return { view: 'forge', trackerId, boardRoute: boardRouteOf(boardSegments) };
}

function agentsRouteOf(segments: readonly string[], query: string): GaiaRoute {
  const [, trackerSegment, jobSegment] = segments;
  const trackerId = decodedSegmentOf(trackerSegment);
  const jobId = decodedSegmentOf(jobSegment);
  return { view: 'agents', selectedAgent: trackerId === null || jobId === null ? null : { trackerId, jobId }, query };
}

function forgesRouteOf(segments: readonly string[], query: string): GaiaRoute {
  const forgeInView = new URLSearchParams(query).get(FORGE_IN_VIEW_PARAMETER);
  return { view: 'forges', addingARepository: segments[1] === ADD_A_REPOSITORY_SEGMENT, forgeInView: forgeInView === '' ? null : forgeInView };
}

function routeOf(fragment: string): GaiaRoute {
  const withoutMark = fragment.startsWith(FRAGMENT_MARK) ? fragment.slice(1) : fragment;
  if (withoutMark.startsWith(FORGE_PREFIX)) return forgeRouteOf(withoutMark.slice(FORGE_PREFIX.length));
  const queryAt = withoutMark.indexOf(QUERY_SEPARATOR);
  const path = queryAt === -1 ? withoutMark : withoutMark.slice(0, queryAt);
  const query = queryAt === -1 ? '' : withoutMark.slice(queryAt + 1);
  const segments = path.split(PATH_SEPARATOR);
  switch (segments[0]) {
    case 'agents':
      return agentsRouteOf(segments, query);
    case 'activity':
      return { view: 'activity' };
    case 'forges':
      return forgesRouteOf(segments, query);
    default:
      return DEFAULT_ROUTE;
  }
}

function withQuery(path: string, query: string): string {
  return query === '' ? path : `${path}${QUERY_SEPARATOR}${query}`;
}

function fragmentOf(route: GaiaRoute): string {
  switch (route.view) {
    case 'attention':
    case 'activity':
      return `#${route.view}`;
    case 'agents': {
      const path = route.selectedAgent === null
        ? '#agents'
        : `#agents/${encodeURIComponent(route.selectedAgent.trackerId)}/${encodeURIComponent(route.selectedAgent.jobId)}`;
      return withQuery(path, route.query);
    }
    case 'forges': {
      const path = route.addingARepository ? `#forges/${ADD_A_REPOSITORY_SEGMENT}` : '#forges';
      return withQuery(path, route.forgeInView === null ? '' : new URLSearchParams({ [FORGE_IN_VIEW_PARAMETER]: route.forgeInView }).toString());
    }
    case 'forge':
      return route.boardRoute === null ? `#forge/${encodeURIComponent(route.trackerId)}` : BoardRouter.fragmentOf(route.trackerId, route.boardRoute);
  }
}

/** A forge's board at a place the server names, by the same reading as an address, so a place named before the Progress views read as its view. */
function servedBoardFragmentOf(trackerId: string, servedRoute: FleetDocumentBoardRoute | null): string {
  const boardRoute = servedRoute === null ? null : BoardRouter.routeOfPlace(servedRoute.tab, servedRoute.item?.split(PATH_SEPARATOR) ?? []);
  return fragmentOf({ view: 'forge', trackerId, boardRoute });
}

/** The fragment an old board link is redirected to, the route's own; `null` for every other fragment. */
function redirectOf(fragment: string): string | null {
  const withoutMark = fragment.startsWith(FRAGMENT_MARK) ? fragment.slice(1) : fragment;
  if (!withoutMark.startsWith(FORGE_PREFIX)) return null;
  const [, placeName, ...itemSegments] = withoutMark.slice(FORGE_PREFIX.length).split(PATH_SEPARATOR);
  if (placeName === undefined || !BoardRouter.placeIsOld(placeName, itemSegments.map((segment) => decodedSegmentOf(segment) ?? ''))) return null;
  const route = routeOf(fragment);
  return route.view === 'forge' && route.boardRoute !== null ? fragmentOf(route) : null;
}

function browserHashSurroundings(): HashSurroundings {
  return {
    currentFragment: () => window.location.hash,
    followFragment:  (listener) => {
      window.addEventListener('hashchange', listener);
      return () => window.removeEventListener('hashchange', listener);
    },
    goTo: (fragment) => {
      window.location.hash = fragment;
    },
    replaceFragment: (fragment) => {
      window.history.replaceState(window.history.state, '', fragment);
    },
  };
}

export const HashRouter = {
  routeOf,
  fragmentOf,
  redirectOf,
  servedBoardFragmentOf,
  browserHashSurroundings,
} as const;
