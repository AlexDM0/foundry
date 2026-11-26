/**
 * A board view under the fixture's tracker whose followed routes move the window's address, as a mounted board's `goTo` does in Gaia, so a
 * DOM spec reads where a view went from `window.location.hash`; and a view drawn at the route that address names, as Gaia's forge route
 * hands it, following each move. Test-only.
 */
import { render, type RenderResult } from '@testing-library/react';
import {
  createElement,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode
} from 'react';

import { BoardRouter, type BoardRoute }          from '../../shared/BoardRouter.ts';
import { BoardGoToContext, BoardTrackerContext } from '../shared/routing/BoardRouteLinks.ts';
import { FIXTURE_TRACKER_ID }                    from './BoardStateFixture.ts';

const BOARD_ADDRESS_PREFIX = `#forge/${FIXTURE_TRACKER_ID}/`;

function goToAddress(fragment: string): void {
  window.location.hash = fragment;
}

/** The route the window's address names under the fixture's tracker; any other address is `fallback`. */
function addressedRouteOf(fallback: BoardRoute): BoardRoute {
  const address = window.location.hash;
  return address.startsWith(BOARD_ADDRESS_PREFIX) ? BoardRouter.routeOf(address.slice(BOARD_ADDRESS_PREFIX.length), null) : fallback;
}

export function onBoard(view: ReactNode): ReactElement {
  return createElement(BoardTrackerContext, { value: FIXTURE_TRACKER_ID }, createElement(BoardGoToContext, { value: goToAddress }, view));
}

export function renderOnBoard(view: ReactElement): RenderResult {
  return render(onBoard(view));
}

interface AddressedViewProps {
  readonly fallback: BoardRoute;
  readonly viewAt:   (route: BoardRoute) => ReactNode;
}

function AddressedView({ fallback, viewAt }: AddressedViewProps): ReactNode {
  const [route, setRoute] = useState(() => addressedRouteOf(fallback));
  useEffect(() => {
    const followAddress = (): void => setRoute(addressedRouteOf(fallback));
    window.addEventListener('hashchange', followAddress);
    return () => window.removeEventListener('hashchange', followAddress);
  }, [fallback]);
  return viewAt(route);
}

/** The view at the route the address names, `fallback` while it names none, drawn again at each move of the address. */
export function onAddressedBoard(fallback: BoardRoute, viewAt: (route: BoardRoute) => ReactNode): ReactElement {
  return onBoard(createElement(AddressedView, { fallback, viewAt }));
}
