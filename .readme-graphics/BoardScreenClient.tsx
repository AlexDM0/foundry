// The browser side of a board screen: mounts Gaia's real page root over the fleet fixture and Example Storefront's board, at the route in
// the address's fragment and in the theme on the document's root. Nothing answers, streams or sends.
import { createElement } from 'react';
import { createRoot }    from 'react-dom/client';

import { createFleetSource }                              from '../apps/gaia/page/shell/FleetSource.ts';
import { browserShellSurroundings, GaiaApp }              from '../apps/gaia/page/shell/GaiaApp.tsx';
import { fixedPageClockAt, silentBoardServicesOf }        from '../apps/gaia/page/testing/ShellSurroundingsAt.ts';
import {
  FLEET_FIVE_FORGES,
  FLEET_FIVE_FORGES_TRACKER_IDS,
  FLEET_FIXTURES_READ_AT,
} from '../apps/gaia/page/testing/fixtures/fleet-five-forges.ts';
import { richStorefrontBoard } from './StorefrontBoard.ts';

const STOREFRONT_TRACKER_ID = FLEET_FIVE_FORGES_TRACKER_IDS.exampleStorefront;

const doNothing = (): void => undefined;
const NO_COMMAND_STATES = { forges: new Map(), fleet: new Map(), fleetAnswers: new Map() };
const paintedSender = {
  send:                  () => Promise.reject(new Error('A painted screen sends no command.')),
  dismissFailure:        doNothing,
  dismissRestartPending: doNothing,
  dismissAnswer:         doNothing,
  states:                () => NO_COMMAND_STATES,
  subscribe:             () => doNothing,
};

const theme = document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light';
const fleetSource = createFleetSource();
fleetSource.publish({ ...FLEET_FIVE_FORGES, settings: { ...FLEET_FIVE_FORGES.settings, theme } });

const browserSurroundings = browserShellSurroundings({ sessionWasLost: doNothing });
const board = richStorefrontBoard(STOREFRONT_TRACKER_ID);
const surroundings = {
  ...browserSurroundings,
  markMotionReady: doNothing,
  clock:           fixedPageClockAt(FLEET_FIXTURES_READ_AT),
  forgeView:       {
    ...browserSurroundings.forgeView,
    requestCrashLog: () => Promise.resolve({ verdict: 'not-read', status: null }),
    boardServicesOf: (trackerId: string) => (trackerId === STOREFRONT_TRACKER_ID
      ? { ...silentBoardServicesOf(trackerId), storage: () => storefrontBoardStorage, readingAtMount: { board, connection: 'live' } }
      : silentBoardServicesOf(trackerId)),
    openInNewTab: doNothing,
  },
};

const rootElement = document.getElementById('gaia-root');
const QUESTION_PANEL_KEY_ENDING = ':question-panel';
const foldedDecisionIdsText = document.documentElement.dataset['foldedDecisions'] ?? null;
const storefrontBoardStorage = {
  getItem:    (key: string) => (key.endsWith(QUESTION_PANEL_KEY_ENDING) ? foldedDecisionIdsText : null),
  setItem:    doNothing,
  removeItem: doNothing,
};
if (rootElement !== null) {
  createRoot(rootElement).render(createElement(GaiaApp as never, {
    fleetSource,
    fleetStream:   { state: () => 'live', subscribe: () => doNothing },
    commandSender: paintedSender,
    surroundings,
  } as never));
}
