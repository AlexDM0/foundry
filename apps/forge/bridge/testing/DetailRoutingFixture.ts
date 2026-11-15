/** A board view rendered as if its tab were open, with the detail routing a spec controls: the opened routes are recorded, never followed. */
import { createElement, type ReactElement } from 'react';

import type { DetailItem, DetailTab }            from '../shell/DetailRoute.ts';
import { DetailRoutingContext, detailRoutingOf } from '../shell/DetailRouting.ts';
import type { BridgeRoute }                      from '../shell/HashRouter.ts';

export interface RoutedView {
  readonly element:         ReactElement;
  /** Every route an opener asked for, in order. */
  readonly navigatedRoutes: BridgeRoute[];
}

export function routedOnTab(tab: DetailTab, view: ReactElement, openItem: DetailItem | null = null): RoutedView {
  const navigatedRoutes: BridgeRoute[] = [];
  const routing = detailRoutingOf(tab, openItem, (route) => navigatedRoutes.push(route));
  return { element: createElement(DetailRoutingContext.Provider, { value: routing }, view), navigatedRoutes };
}
