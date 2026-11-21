/**
 * A board route as the framed Bridge writes it and back: `#<tab>[/<encoded item segments>]`, the fragment after Gaia's tracker id. The
 * frame speaks the Bridge's own fragments until WP6.23 retires it; Gaia's address holds the board route.
 */
import { BOARD_TABS, type BoardRoute, type BoardTab } from '../../../board/shell/BoardRouter.ts';

const FRAGMENT_MARK = '#';
const SEGMENT_SEPARATOR = '/';

function isBoardTab(name: string): name is BoardTab {
  return (BOARD_TABS as readonly string[]).includes(name);
}

function decodedSegmentOf(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function bridgeFragmentOf(route: BoardRoute): string {
  if (route.item === null) return `${FRAGMENT_MARK}${route.tab}`;
  return `${FRAGMENT_MARK}${route.tab}${SEGMENT_SEPARATOR}${route.item.split(SEGMENT_SEPARATOR).map(encodeURIComponent).join(SEGMENT_SEPARATOR)}`;
}

/** `null` for a fragment that names no board tab, such as the Bridge's start; a malformed item reads as the tab alone. */
function boardRouteOfBridgeFragment(fragment: string): BoardRoute | null {
  const withoutMark = fragment.startsWith(FRAGMENT_MARK) ? fragment.slice(FRAGMENT_MARK.length) : fragment;
  const [tab = '', ...itemSegments] = withoutMark.split(SEGMENT_SEPARATOR);
  if (!isBoardTab(tab)) return null;
  const decodedItemSegments = itemSegments.map(decodedSegmentOf);
  const itemIsReadable = decodedItemSegments.length > 0 && decodedItemSegments.every((segment) => segment !== null && segment !== '');
  return { tab, item: itemIsReadable ? decodedItemSegments.join(SEGMENT_SEPARATOR) : null };
}

export const FrameRouteUtil = Object.freeze({ bridgeFragmentOf, boardRouteOfBridgeFragment });
