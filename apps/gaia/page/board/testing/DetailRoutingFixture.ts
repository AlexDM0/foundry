/**
 * A board view rendered as if its tab were open under the fixture's tracker, with the detail routing a spec controls: the opened routes and
 * every fragment the view goes to are recorded, never followed.
 */
import { createElement, type ReactElement } from 'react';

import type { BoardRoute }                       from '../../shared/BoardRouter.ts';
import { BoardRouter }                           from '../../shared/BoardRouter.ts';
import { BoardGoToContext, BoardTrackerContext } from '../shared/routing/BoardRouteLinks.ts';
import type { DetailItem, DetailTab }            from '../shared/routing/DetailRoute.ts';
import { DetailRoutingContext, detailRoutingOf } from '../shared/routing/DetailRouting.ts';
import { FIXTURE_TRACKER_ID }                    from './BoardStateFixture.ts';

export interface RoutedView {
  readonly element:           ReactElement;
  /** Every route an opener asked for, in order. */
  readonly navigatedRoutes:   BoardRoute[];
  /** Every fragment the view went to through the board's navigation, such as a section tab chosen by key, in order. */
  readonly followedFragments: string[];
}

/** `followedFragments` gathers the fragments of several renders of one view into one list. */
export function routedOnTab(tab: DetailTab, view: ReactElement, openItem: DetailItem | null = null, followedFragments: string[] = []): RoutedView {
  const navigatedRoutes: BoardRoute[] = [];
  const routing = detailRoutingOf(tab, openItem, (route) => navigatedRoutes.push(route), (route) => BoardRouter.fragmentOf(FIXTURE_TRACKER_ID, route));
  const goTo = (fragment: string): void => {
    followedFragments.push(fragment);
  };
  const routedView = createElement(BoardGoToContext.Provider, { value: goTo }, createElement(DetailRoutingContext.Provider, { value: routing }, view));
  return { element: createElement(BoardTrackerContext.Provider, { value: FIXTURE_TRACKER_ID }, routedView), navigatedRoutes, followedFragments };
}
