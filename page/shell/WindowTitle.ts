/**
 * The title of the view a route shows and the window's title made from it: `(5) Gaia · Attention`. The count of what waits on User leads
 * the title, so it shows in the window list where a Dock badge would; with nothing waiting it is left out.
 */
import { PRODUCT_NAMES }      from '../../src/shared/constants/ProductNames.ts';
import type { FleetDocument } from '../@types/FleetDocument.ts';
import type { GaiaRoute }     from './HashRouter.ts';
import { RailModel }          from './RailModel.ts';

const TITLE_SEPARATOR = ' · ';

/** A forge in place is titled by its project; a tracker id the document does not hold yet stands in for it. */
function viewTitleOf(route: GaiaRoute, fleetDocument: FleetDocument | null): string {
  if (route.view !== 'forge') return RailModel.VIEW_LABELS[route.view];
  const forge = fleetDocument?.forges.find((candidate) => candidate.trackerId === route.trackerId);
  return forge?.project ?? route.trackerId;
}

/** The count is the rail's Attention count, `4+` included, so the two never disagree. */
function windowTitleOf(viewTitle: string, fleetDocument: FleetDocument | null): string {
  const attentionCount = fleetDocument === null ? null : RailModel.attentionCountOf(fleetDocument);
  const title = `${PRODUCT_NAMES.applicationName}${TITLE_SEPARATOR}${viewTitle}`;
  return attentionCount === null ? title : `(${RailModel.countTextOf(attentionCount)}) ${title}`;
}

export const WindowTitle = {
  viewTitleOf,
  windowTitleOf,
} as const;
