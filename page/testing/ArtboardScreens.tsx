/**
 * Test-only: each artboard of the design that Gaia's page builds, as the page paints it from that artboard's fixture, and as a whole
 * document in either theme with Gaia's own stylesheets inlined, which a browser opens at the artboard's size for the visual pass. A state
 * the artboard shows mid-use, such as B2's Stop dialog, refusal and start on their way, is set in the view's own state, not drawn apart.
 * A state no artboard draws, which a later decision of the owner added, is painted over the artboard it changes, for the same pass.
 */
import { readFileSync }         from 'node:fs';
import { join }                 from 'node:path';
import { pathToFileURL }        from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';

import { FLINT_BRAIN_CONTRACT_VERSIONS }                                            from '../../src/shared/constants/ContractVersions.ts';
import type { CommandAnswerDocument, ForgeCommandBody }                             from '../@types/CommandDocument.ts';
import type { FleetDocument, FleetDocumentBrainState }                              from '../@types/FleetDocument.ts';
import { type CommandSender, CommandSenderContext, type CommandStates }             from '../api/CommandSender.ts';
import { GaiaShell, viewPartsOf }                                                   from '../shell/GaiaApp.tsx';
import { HashRouter }                                                               from '../shell/HashRouter.ts';
import { ForgesLayout }                                                             from '../views/forges/ForgesLayout.tsx';
import { ForgesModel, type StopDialogState }                                        from '../views/forges/ForgesModel.ts';
import { GaiaPanelModel }                                                           from '../views/forges/GaiaPanelModel.ts';
import { WhatNotifiesDialog }                                                       from '../views/forges/WhatNotifiesDialog.tsx';
import { DesignSystemStylesheet }                                                   from './DesignSystemStylesheet.ts';
import { forgeFrameSurroundingsAt }                                                 from './ShellSurroundingsAt.ts';
import { FLEET_AT_LIMIT }                                                           from './fixtures/fleet-at-limit.ts';
import { fleetWithStorefrontBrainOf }                                               from './fixtures/fleet-brain-states.ts';
import { FLEET_DEGRADED }                                                           from './fixtures/fleet-degraded.ts';
import { FLEET_EMPTY }                                                              from './fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from './fixtures/fleet-five-forges.ts';

export type ScreenTheme = 'dark' | 'light';

/** Both themes are designed, and every screen is built and checked in each; light is the package's default. */
export const SCREEN_THEMES: readonly ScreenTheme[] = ['light', 'dark'];

/** Every artboard Gaia's page builds is drawn at this size. */
export const ARTBOARD_SIZE_PIXELS = { width: 1440, height: 1016 } as const;

/** The artboards in `designs/canvas.json`, by their mark. C2 is a dialog painted over A4 below; C3, the splash, is a file page of its own. */
export type PageArtboard = 'A1' | 'A2' | 'A3' | 'A4' | 'B1' | 'B2' | 'B3' | 'B4';

/** How the view of a screen is set: as the route shows it, with B2's controls in use, or after an update that left a restart pending. */
type ScreenViewState = 'as-routed' | 'forge-controls-in-use' | 'restart-pending';

export interface ArtboardScreen {
  readonly artboard:      PageArtboard;
  readonly title:         string;
  /** The artboard's source in the design handoff's `designs/` folder. */
  readonly designFile:    string;
  readonly fleetDocument: FleetDocument;
  readonly fragment:      string;
  readonly viewState:     ScreenViewState;
}

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

/** The fixture's forges serve control 1; A2 draws Wake and Stop, which a forge offers only at the control contract that carries them (G3). */
const FLEET_SERVING_THE_BRAIN: FleetDocument = {
  ...FLEET_FIVE_FORGES,
  forges: FLEET_FIVE_FORGES.forges.map((forge) => ({ ...forge, contracts: { ...forge.contracts, control: FLINT_BRAIN_CONTRACT_VERSIONS.forgeControl } })),
};

const STYLESHEET_PATHS = [join(import.meta.dir, '..', 'styles', 'tokens.css'), join(import.meta.dir, '..', 'styles', 'gaia.css')];

export const ARTBOARD_SCREENS: readonly ArtboardScreen[] = [
  {
    artboard:      'A1',
    title:         'Attention (home)',
    designFile:    'Main.dc.html',
    fleetDocument: FLEET_FIVE_FORGES,
    fragment:      '#attention',
    viewState:     'as-routed',
  },
  {
    artboard:      'A2',
    title:         'Agents, a job selected',
    designFile:    'Agents.dc.html',
    fleetDocument: FLEET_SERVING_THE_BRAIN,
    fragment:      HashRouter.fragmentOf({ view: 'agents', selectedAgent: { trackerId: TRACKER_IDS.exampleStorefront, jobId: 'J4' }, query: '' }),
    viewState:     'as-routed',
  },
  {
    artboard:      'A3',
    title:         'Activity',
    designFile:    'Activity.dc.html',
    fleetDocument: FLEET_FIVE_FORGES,
    fragment:      '#activity',
    viewState:     'as-routed',
  },
  {
    artboard:      'A4',
    title:         'Forges and this machine',
    designFile:    'Forges.dc.html',
    fleetDocument: FLEET_FIVE_FORGES,
    fragment:      '#forges',
    viewState:     'as-routed',
  },
  {
    artboard:      'B1',
    title:         'A forge in place',
    designFile:    'Forge.dc.html',
    fleetDocument: fleetWithStorefrontBrainOf('off'),
    fragment:      HashRouter.fragmentOf({ view: 'forge', trackerId: TRACKER_IDS.exampleStorefront, bridgeFragment: '#questions/E2' }),
    viewState:     'as-routed',
  },
  {
    artboard:      'B2',
    title:         'Start, stop and a refusal',
    designFile:    'ForgeControls.dc.html',
    fleetDocument: FLEET_AT_LIMIT,
    fragment:      '#forges',
    viewState:     'forge-controls-in-use',
  },
  {
    artboard:      'B3',
    title:         'Forges Gaia cannot fully read',
    designFile:    'Degraded.dc.html',
    fleetDocument: FLEET_DEGRADED,
    fragment:      '#attention',
    viewState:     'as-routed',
  },
  {
    artboard:      'B4',
    title:         'No forge yet',
    designFile:    'Empty.dc.html',
    fleetDocument: FLEET_EMPTY,
    fragment:      '#attention',
    viewState:     'as-routed',
  },
];

export interface BrainStateScreen extends ArtboardScreen {
  readonly artboard:   'B1';
  /** The state of B1's `brain` tweak the screen paints; its artboard render is `B1-<state>-<theme>.png`. */
  readonly brainState: FleetDocumentBrainState;
}

const BRAIN_STATES_OF_B1: readonly FleetDocumentBrainState[] = ['off', 'starting', 'running', 'refused', 'ended'];

/** B1 in each state of its `brain` tweak, Example Storefront's brain set to it: off, the artboard's own state, then the four others. */
export const BRAIN_STATE_SCREENS: readonly BrainStateScreen[] = BRAIN_STATES_OF_B1.map((brainState) => ({
  artboard:      'B1',
  title:         `A forge in place, Flint's brain ${brainState}`,
  designFile:    'Forge.dc.html',
  fleetDocument: fleetWithStorefrontBrainOf(brainState),
  fragment:      HashRouter.fragmentOf({ view: 'forge', trackerId: TRACKER_IDS.exampleStorefront, bridgeFragment: '#questions/E2' }),
  viewState:     'as-routed',
  brainState,
}));

/** A2's `selected` tweak at `brain`: Example Storefront's running brain selected, its panel beside the table (SCREENS A2, R4.5). */
export const BRAIN_SCREENS: readonly ArtboardScreen[] = [
  {
    artboard:      'A2',
    title:         'Agents, Flint\'s brain selected',
    designFile:    'AgentsBrain.dc.html',
    fleetDocument: FLEET_SERVING_THE_BRAIN,
    fragment:      HashRouter.fragmentOf({ view: 'agents', selectedAgent: { trackerId: TRACKER_IDS.exampleStorefront, jobId: 'flint-brain' }, query: '' }),
    viewState:     'as-routed',
  },
];

/**
 * D4: Example Mobile App, held since its install version changed, after an Update forge whose Baton pass its live Overseer did not take.
 * Each screen is its artboard's, with the pending restart under the control that sent the update.
 */
export const RESTART_PENDING_SCREENS: readonly ArtboardScreen[] = [
  {
    artboard:      'A1',
    title:         'Attention, an update left a restart pending',
    designFile:    'Main.dc.html',
    fleetDocument: FLEET_FIVE_FORGES,
    fragment:      '#attention',
    viewState:     'restart-pending',
  },
  {
    artboard:      'A4',
    title:         'Forges, an update left a restart pending',
    designFile:    'Forges.dc.html',
    fleetDocument: FLEET_FIVE_FORGES,
    fragment:      '#forges',
    viewState:     'restart-pending',
  },
];

/** The sentence a forge at monitor contract 2 sends with its warning that a Baton pass failed, which names no command. */
export const BATON_PASS_FAILED_SENTENCE = 'the Baton pass to code 4c1d9e2 failed at take-baton: the successor did not answer';

/** The notice that Research Wiki's Assistant cannot come up, as the server words it in Gaia's words. */
export const ASSISTANT_DOWN_SENTENCE = 'This forge\'s Assistant cannot come up, so its open incidents take their defaults.';

/** Invoice Service warns that its Baton pass failed, so A1 shows that look before the two the artboard draws. */
const FLEET_BATON_PASS_FAILED: FleetDocument = {
  ...FLEET_FIVE_FORGES,
  forges: FLEET_FIVE_FORGES.forges.map((forge) => (forge.trackerId === TRACKER_IDS.invoiceService
    ? { ...forge, warnings: [{ kind: 'baton-pass-failed', text: BATON_PASS_FAILED_SENTENCE }] }
    : forge)),
  needsALook: [{ trackerId: TRACKER_IDS.invoiceService, kind: 'baton-pass-failed' }, ...FLEET_FIVE_FORGES.needsALook],
};

/** Research Wiki's Assistant cannot come up: a notice under its row on A4. */
const FLEET_ASSISTANT_DOWN: FleetDocument = {
  ...FLEET_FIVE_FORGES,
  forges: FLEET_FIVE_FORGES.forges.map((forge) => (forge.trackerId === TRACKER_IDS.researchWiki
    ? { ...forge, notices: [{ kind: 'assistant-down', text: ASSISTANT_DOWN_SENTENCE }] }
    : forge)),
};

/** D5: the warnings of monitor contract 2, which no artboard draws, each over the artboard that shows it. */
export const MONITOR_WARNING_SCREENS: readonly ArtboardScreen[] = [
  {
    artboard:      'A1',
    title:         'Attention, a Baton pass failed',
    designFile:    'Main.dc.html',
    fleetDocument: FLEET_BATON_PASS_FAILED,
    fragment:      '#attention',
    viewState:     'as-routed',
  },
  {
    artboard:      'A4',
    title:         'Forges, an Assistant cannot come up',
    designFile:    'Forges.dc.html',
    fleetDocument: FLEET_ASSISTANT_DOWN,
    fragment:      '#forges',
    viewState:     'as-routed',
  },
];

/** A4 draws a seventh forge, Old Prototype, hidden in Gaia: dormant since 3 November, its row folded under "Hidden in Gaia". */
export const OLD_PROTOTYPE_TRACKER_ID = 'old-prototype-5a21';

function oldPrototypeOf(fleetDocument: FleetDocument): FleetDocument['forges'][number] {
  const dormant = fleetDocument.forges.find((forge) => forge.trackerId === TRACKER_IDS.designSystem);
  if (dormant === undefined) throw new Error('The fixture holds no dormant forge to draw Old Prototype from.');
  return {
    ...dormant,
    trackerId:     OLD_PROTOTYPE_TRACKER_ID,
    project:       'Old Prototype',
    root:          '/Users/alexexample/development/old-prototype',
    lastChangedAt: '2026-11-03T16:05:00.000Z',
    attention:     [],
    agents:        [],
  };
}

const FLEET_WITH_A_HIDDEN_FORGE: FleetDocument = {
  ...FLEET_FIVE_FORGES,
  forges:   [...FLEET_FIVE_FORGES.forges, oldPrototypeOf(FLEET_FIVE_FORGES)],
  settings: { ...FLEET_FIVE_FORGES.settings, hiddenTrackerIds: [OLD_PROTOTYPE_TRACKER_ID] },
};

/** A4's hidden forge, which the five forges' fixture does not hold: its figure and its folded group, over the artboard that draws them. */
export const HIDDEN_FORGE_SCREENS: readonly ArtboardScreen[] = [
  {
    artboard:      'A4',
    title:         'Forges, a forge hidden in Gaia',
    designFile:    'Forges.dc.html',
    fleetDocument: FLEET_WITH_A_HIDDEN_FORGE,
    fragment:      '#forges',
    viewState:     'restart-pending',
  },
];

/** B4 with the forge program found where Gaia looks for it, the state the board's `forgeProgram` tweak calls `found`. */
const FLEET_EMPTY_FORGE_PROGRAM_FOUND: FleetDocument = {
  ...FLEET_EMPTY,
  gaia: { ...FLEET_EMPTY.gaia, forgeProgramInUse: `${FLEET_EMPTY.gaia.homeFolder}/.bun/bin/forge` },
};

/** B4's second state: the artboard paints the forge program missing, as `ARTBOARD_SCREENS` does, and found. */
export const FORGE_PROGRAM_FOUND_SCREENS: readonly ArtboardScreen[] = [
  {
    artboard:      'B4',
    title:         'No forge yet, the forge program found',
    designFile:    'Empty.dc.html',
    fleetDocument: FLEET_EMPTY_FORGE_PROGRAM_FOUND,
    fragment:      '#attention',
    viewState:     'as-routed',
  },
];

/** B2's refusal: the forge's own code and sentence, as the artboard words them. */
export const B2_STOP_REFUSAL: CommandAnswerDocument = {
  answerVersion: 2,
  outcome:       'refused',
  refusal:       'overseer-still-live',
  text:          'The Overseer did not stop within its tries.',
};

/** B2: Example Mobile App's Stop refused and kept until dismissed, Design System's `forge start` on its way. */
const B2_COMMAND_STATES: CommandStates = {
  forges: new Map([
    [TRACKER_IDS.exampleMobileApp, { onItsWay: null, failure: { kind: 'forge-stop', result: { verdict: 'answered', answer: B2_STOP_REFUSAL } }, restartPending: false }],
    [TRACKER_IDS.designSystem, { onItsWay: 'forge-start', failure: null, restartPending: false }],
  ]),
  fleet: new Map(),
};

const RESTART_PENDING_COMMAND_STATES: CommandStates = {
  forges: new Map([[TRACKER_IDS.exampleMobileApp, { onItsWay: null, failure: null, restartPending: true }]]),
  fleet:  new Map(),
};

const B2_STOP_DIALOG: StopDialogState = { trackerId: TRACKER_IDS.exampleStorefront, agents: 'keep' };

/** The Stop the view sent Example Mobile App, which its "Try again" sends again. */
const B2_LAST_SENT: ReadonlyMap<string, ForgeCommandBody> = new Map([
  [TRACKER_IDS.exampleMobileApp, { kind: 'forge-stop', trackerId: TRACKER_IDS.exampleMobileApp, agents: 'keep' }],
]);

const NO_COMMAND_STATES: CommandStates = { forges: new Map(), fleet: new Map() };

function doNothing(): void {
  return undefined;
}

/** A sender that holds the screen's command states and sends nothing: a screen is painted, never used. */
function senderHolding(commandStates: CommandStates): CommandSender {
  return {
    send:                  () => Promise.reject(new Error('A screen of the visual pass sends no command.')),
    dismissFailure:        doNothing,
    dismissRestartPending: doNothing,
    states:                () => commandStates,
    subscribe:             () => doNothing,
  };
}

function forgeControlsInUse(fleetDocument: FleetDocument) {
  const content = ForgesModel.forgesContentOf(fleetDocument, {
    clock:         { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' },
    commandStates: B2_COMMAND_STATES,
    stopDialog:    B2_STOP_DIALOG,
    forgeInView:   null,
    lastSent:      B2_LAST_SENT,
  });
  return (
    <ForgesLayout
      content={content}
      gaiaPanel={GaiaPanelModel.gaiaPanelOf(fleetDocument, { commandStates: B2_COMMAND_STATES, sentSettingsChange: null })}
      commandStates={B2_COMMAND_STATES}
      handlers={{
        onCommand:               doNothing,
        onOpenStopDialog:        doNothing,
        onStopChoice:            doNothing,
        onCancelStop:            doNothing,
        onConfirmStop:           doNothing,
        onDismissFailure:        doNothing,
        onDismissRestartPending: doNothing,
        onSettingsCheckbox:      doNothing,
        onOpenWhatNotifies:      doNothing,
      }}
    />
  );
}

function commandStatesOf(viewState: ScreenViewState): CommandStates {
  switch (viewState) {
    case 'as-routed':
      return NO_COMMAND_STATES;
    case 'forge-controls-in-use':
      return B2_COMMAND_STATES;
    case 'restart-pending':
      return RESTART_PENDING_COMMAND_STATES;
  }
}

/** The theme the screen is shown in is the one chosen in Gaia's settings, so the theme button shows that theme. */
function fleetDocumentInTheme(fleetDocument: FleetDocument, theme: ScreenTheme): FleetDocument {
  return { ...fleetDocument, settings: { ...fleetDocument.settings, theme } };
}

/** The shell as the page paints it for the screen: the brand bar, the rail, the page title and the view, with every control live. */
export function screenMarkupOf(screen: ArtboardScreen, theme: ScreenTheme): string {
  const fleetDocument = fleetDocumentInTheme(screen.fleetDocument, theme);
  const route = HashRouter.routeOf(screen.fragment);
  const routedParts = viewPartsOf(route, fleetDocument, {
    readAtMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT),
    timeZone:           'UTC',
    goTo:               doNothing,
    forgeFrame:         forgeFrameSurroundingsAt(),
  });
  const inUse = screen.viewState === 'forge-controls-in-use';
  const view = inUse ? { ...routedParts, content: forgeControlsInUse(fleetDocument) } : routedParts;
  return renderToStaticMarkup(
    <CommandSenderContext value={senderHolding(commandStatesOf(screen.viewState))}>
      <GaiaShell
        fleetDocument={fleetDocument}
        streamState="live"
        route={route}
        view={view}
        themeChoice={theme}
        onThemeChoice={doNothing}
      />
    </CommandSenderContext>,
  );
}

/**
 * A whole page for a browser: the theme set on the root as the page sets it before its first paint, motion ready, and the stylesheets
 * inline in the page's order, the design system's fonts and stylesheet before Gaia's.
 */
export function screenDocumentOf(screen: ArtboardScreen, theme: ScreenTheme): string {
  return documentAround(`${screen.artboard} ${screen.title}, ${theme}`, theme, `<div id="gaia-root">${screenMarkupOf(screen, theme)}</div>`);
}

function documentAround(title: string, theme: ScreenTheme, bodyMarkup: string): string {
  const stylesheetTexts = [
    DesignSystemStylesheet.fontFaceRules(),
    DesignSystemStylesheet.text(),
    ...STYLESHEET_PATHS.map((stylesheetPath) => readFileSync(stylesheetPath, 'utf8')),
  ];
  const stylesheets = stylesheetTexts.map((stylesheetText) => `<style>\n${stylesheetText}</style>`).join('\n');
  return [
    '<!doctype html>',
    `<html lang="en" data-theme="${theme}" data-motion="ready">`,
    '<head>',
    '<meta charset="utf-8">',
    `<title>${title}</title>`,
    stylesheets,
    '</head>',
    '<body>',
    bodyMarkup,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

export interface WhatNotifiesScreen {
  readonly artboard:      'C2';
  readonly title:         string;
  readonly designFile:    'Notifications.dc.html';
  readonly fleetDocument: FleetDocument;
}

/** C2's checklist as the page builds it: the "What notifies" dialog over the Forges view it opens from, its kinds as the fixture's settings set them. */
export const WHAT_NOTIFIES_SCREENS: readonly WhatNotifiesScreen[] = [
  {
    artboard:      'C2',
    title:         'What notifies',
    designFile:    'Notifications.dc.html',
    fleetDocument: FLEET_FIVE_FORGES,
  },
];

/** The dialog as the Forges view opens it, with every control live; a server render shows no dialog, which the page opens as a modal. */
export function whatNotifiesMarkupOf(screen: WhatNotifiesScreen, theme: ScreenTheme): string {
  const fleetDocument = fleetDocumentInTheme(screen.fleetDocument, theme);
  return renderToStaticMarkup(
    <WhatNotifiesDialog
      content={GaiaPanelModel.whatNotifiesOf(fleetDocument, { commandStates: NO_COMMAND_STATES, sentSettingsChange: null })}
      handlers={{ onSettingsCheckbox: doNothing, onDismissFailure: doNothing }}
      onClose={doNothing}
    />,
  );
}

/** The page shows a dialog with `showModal()`, which a server render cannot, so the document does it once loaded: top layer and scrim. */
const SHOW_DIALOGS_SCRIPT = '<script>for (const dialog of document.querySelectorAll(\'dialog\')) dialog.showModal();</script>';

/** The Forges view in the screen's theme, with the dialog shown over it as the page shows it. */
export function whatNotifiesDocumentOf(screen: WhatNotifiesScreen, theme: ScreenTheme): string {
  const forges = { ...screenOfArtboard('A4'), fleetDocument: screen.fleetDocument };
  const bodyMarkup = `<div id="gaia-root">${screenMarkupOf(forges, theme)}${whatNotifiesMarkupOf(screen, theme)}</div>\n${SHOW_DIALOGS_SCRIPT}`;
  return documentAround(`${screen.artboard} ${screen.title}, ${theme}`, theme, bodyMarkup);
}

function screenOfArtboard(artboard: PageArtboard): ArtboardScreen {
  const screen = ARTBOARD_SCREENS.find((candidate) => candidate.artboard === artboard);
  if (screen === undefined) throw new Error(`No screen paints artboard ${artboard}.`);
  return screen;
}

/** The two steps C3's `step` tweak draws: the server starting, and the window about to open on Gaia's page. */
export type SplashStepShown = 'starting' | 'opening';

export interface SplashScreen {
  readonly artboard:   'C3';
  readonly designFile: 'Splash.dc.html';
  readonly step:       SplashStepShown;
}

/** C3 is drawn at this size, smaller than the window the launcher opens. */
export const SPLASH_SIZE_PIXELS = { width: 900, height: 560 } as const;

/** The mark's size on the splash (COMPONENT_LIBRARY 3.1). */
export const SPLASH_MARK_SIZE_PIXELS = 88;

/** The address C3 draws on its `opening` step. */
const SPLASH_SERVER_ADDRESS = '127.0.0.1:4790';

export const SPLASH_PAGE_PATH = join(import.meta.dir, '..', '..', 'resources', 'page', 'loading.html');

export const SPLASH_SCREENS: readonly SplashScreen[] = [
  { artboard: 'C3', designFile: 'Splash.dc.html', step: 'starting' },
  { artboard: 'C3', designFile: 'Splash.dc.html', step: 'opening' },
];

/**
 * The splash's own file at a step, as the launcher addresses it: Gaia's address and the theme in the query, the step in the fragment. A
 * browser opens it at C3's size; the splash is a file page and is shown as it is, never rebuilt.
 */
export function splashScreenAddressOf(screen: SplashScreen, theme: ScreenTheme): string {
  const splashAddress = pathToFileURL(SPLASH_PAGE_PATH);
  splashAddress.search = new URLSearchParams({ address: SPLASH_SERVER_ADDRESS, theme }).toString();
  splashAddress.hash = new URLSearchParams({ step: screen.step }).toString();
  return splashAddress.href;
}
