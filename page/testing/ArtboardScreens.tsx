/**
 * Test-only: each artboard of the design that Gaia's page builds, as the page paints it from that artboard's fixture, and as a whole
 * document in either theme with Gaia's own stylesheets inlined, which a browser opens at the artboard's size for the visual pass. A state
 * the artboard shows mid-use, such as B2's Stop dialog, refusal and start on their way, is set in the view's own state, not drawn apart.
 */
import { readFileSync }         from 'node:fs';
import { join }                 from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

import type { CommandAnswerDocument, ForgeCommandBody }                             from '../@types/CommandDocument.ts';
import type { FleetDocument }                                                       from '../@types/FleetDocument.ts';
import { type CommandSender, CommandSenderContext, type CommandStates }             from '../api/CommandSender.ts';
import { GaiaShell, viewPartsOf }                                                   from '../shell/GaiaApp.tsx';
import { HashRouter }                                                               from '../shell/HashRouter.ts';
import { WindowTitle }                                                              from '../shell/WindowTitle.ts';
import { ForgesLayout }                                                             from '../views/forges/ForgesLayout.tsx';
import { ForgesModel, type StopDialogState }                                        from '../views/forges/ForgesModel.ts';
import { GaiaPanelModel }                                                           from '../views/forges/GaiaPanelModel.ts';
import { forgeFrameSurroundingsAt }                                                 from './ShellSurroundingsAt.ts';
import { FLEET_AT_LIMIT }                                                           from './fixtures/fleet-at-limit.ts';
import { FLEET_DEGRADED }                                                           from './fixtures/fleet-degraded.ts';
import { FLEET_EMPTY }                                                              from './fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from './fixtures/fleet-five-forges.ts';

export type ScreenTheme = 'dark' | 'light';

/** Dark is the designed theme; both are built and checked. */
export const SCREEN_THEMES: readonly ScreenTheme[] = ['dark', 'light'];

/** Every artboard Gaia's page builds is drawn at this size. */
export const ARTBOARD_SIZE_PIXELS = { width: 1440, height: 1016 } as const;

/** The artboards in `designs/canvas.json`, by their mark. C2 waits for notifications (W5.6); C3 is the launcher's static splash page. */
export type PageArtboard = 'A1' | 'A2' | 'A3' | 'A4' | 'B1' | 'B2' | 'B3' | 'B4' | 'C1';

/** How the view of a screen is set: as the route shows it, or with B2's controls in use. */
type ScreenViewState = 'as-routed' | 'forge-controls-in-use';

export interface ArtboardScreen {
  readonly artboard:      PageArtboard;
  readonly title:         string;
  /** The artboard's source in the design handoff's `designs/` folder. */
  readonly designFile:    string;
  readonly fleetDocument: FleetDocument;
  readonly fragment:      string;
  readonly viewState:     ScreenViewState;
  /** The one theme the artboard is drawn in; `null` for an artboard drawn in dark and built in both. */
  readonly onlyTheme:     ScreenTheme | null;
}

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

const STYLESHEET_PATHS = [join(import.meta.dir, '..', 'styles', 'tokens.css'), join(import.meta.dir, '..', 'styles', 'gaia.css')];

export const ARTBOARD_SCREENS: readonly ArtboardScreen[] = [
  {
    artboard:      'A1',
    title:         'Attention (home)',
    designFile:    'Main.dc.html',
    fleetDocument: FLEET_FIVE_FORGES,
    fragment:      '#attention',
    viewState:     'as-routed',
    onlyTheme:     null,
  },
  {
    artboard:      'A2',
    title:         'Agents',
    designFile:    'Agents.dc.html',
    fleetDocument: FLEET_FIVE_FORGES,
    fragment:      HashRouter.fragmentOf({ view: 'agents', selectedAgent: { trackerId: TRACKER_IDS.invoiceService, jobId: 'J12' }, query: '' }),
    viewState:     'as-routed',
    onlyTheme:     null,
  },
  {
    artboard:      'A3',
    title:         'Activity',
    designFile:    'Activity.dc.html',
    fleetDocument: FLEET_FIVE_FORGES,
    fragment:      '#activity',
    viewState:     'as-routed',
    onlyTheme:     null,
  },
  {
    artboard:      'A4',
    title:         'Forges and this machine',
    designFile:    'Forges.dc.html',
    fleetDocument: FLEET_FIVE_FORGES,
    fragment:      '#forges',
    viewState:     'as-routed',
    onlyTheme:     null,
  },
  {
    artboard:      'B1',
    title:         'A forge in place',
    designFile:    'Forge.dc.html',
    fleetDocument: FLEET_FIVE_FORGES,
    fragment:      HashRouter.fragmentOf({ view: 'forge', trackerId: TRACKER_IDS.exampleStorefront, bridgeFragment: '#questions/E2' }),
    viewState:     'as-routed',
    onlyTheme:     null,
  },
  {
    artboard:      'B2',
    title:         'Start, stop and a refusal',
    designFile:    'ForgeControls.dc.html',
    fleetDocument: FLEET_AT_LIMIT,
    fragment:      '#forges',
    viewState:     'forge-controls-in-use',
    onlyTheme:     null,
  },
  {
    artboard:      'B3',
    title:         'Forges Gaia cannot fully read',
    designFile:    'Degraded.dc.html',
    fleetDocument: FLEET_DEGRADED,
    fragment:      '#attention',
    viewState:     'as-routed',
    onlyTheme:     null,
  },
  {
    artboard:      'B4',
    title:         'No forge yet',
    designFile:    'Empty.dc.html',
    fleetDocument: FLEET_EMPTY,
    fragment:      '#attention',
    viewState:     'as-routed',
    onlyTheme:     null,
  },
  {
    artboard:      'C1',
    title:         'Attention, light theme',
    designFile:    'MainLight.dc.html',
    fleetDocument: FLEET_FIVE_FORGES,
    fragment:      '#attention',
    viewState:     'as-routed',
    onlyTheme:     'light',
  },
];

/** B2's refusal: the forge's own code and sentence, as the artboard words them. */
export const B2_STOP_REFUSAL: CommandAnswerDocument = {
  answerVersion: 1,
  outcome:       'refused',
  refusal:       'overseer-still-live',
  text:          'The Overseer did not stop within its tries.',
};

/** B2: Example Mobile App's Stop refused and kept until dismissed, Design System's `forge start` on its way. */
const B2_COMMAND_STATES: CommandStates = {
  forges: new Map([
    [TRACKER_IDS.exampleMobileApp, { onItsWay: null, failure: { kind: 'forge-stop', result: { verdict: 'answered', answer: B2_STOP_REFUSAL } } }],
    [TRACKER_IDS.designSystem, { onItsWay: 'forge-start', failure: null }],
  ]),
  fleet: new Map(),
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
    send:           () => Promise.reject(new Error('A screen of the visual pass sends no command.')),
    dismissFailure: doNothing,
    states:         () => commandStates,
    subscribe:      () => doNothing,
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
        onCommand:          doNothing,
        onOpenStopDialog:   doNothing,
        onStopChoice:       doNothing,
        onCancelStop:       doNothing,
        onConfirmStop:      doNothing,
        onDismissFailure:   doNothing,
        onSettingsCheckbox: doNothing,
        onOpenWhatNotifies: doNothing,
      }}
    />
  );
}

/** The theme the screen is shown in is the one chosen in Gaia's settings, so the switch presses that theme. */
function fleetDocumentInTheme(fleetDocument: FleetDocument, theme: ScreenTheme): FleetDocument {
  return { ...fleetDocument, settings: { ...fleetDocument.settings, theme } };
}

/** The shell as the page paints it for the screen: the rail, the top bar and the view, with every control live. */
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
    <CommandSenderContext value={senderHolding(inUse ? B2_COMMAND_STATES : NO_COMMAND_STATES)}>
      <GaiaShell
        fleetDocument={fleetDocument}
        streamState="live"
        route={route}
        viewTitle={WindowTitle.viewTitleOf(route, fleetDocument)}
        view={view}
        themeChoice={theme}
        onThemeChoice={doNothing}
      />
    </CommandSenderContext>,
  );
}

/** The themes a screen is checked in: both, unless its artboard is drawn in one only. */
export function themesOf(screen: ArtboardScreen): readonly ScreenTheme[] {
  return screen.onlyTheme === null ? SCREEN_THEMES : [screen.onlyTheme];
}

/** A whole page for a browser: the theme set on the root as the page sets it before its first paint, motion ready, Gaia's stylesheets inline. */
export function screenDocumentOf(screen: ArtboardScreen, theme: ScreenTheme): string {
  const stylesheets = STYLESHEET_PATHS.map((stylesheetPath) => `<style>\n${readFileSync(stylesheetPath, 'utf8')}</style>`).join('\n');
  return [
    '<!doctype html>',
    `<html lang="en" data-theme="${theme}" data-motion="ready">`,
    '<head>',
    '<meta charset="utf-8">',
    `<title>${screen.artboard} ${screen.title}, ${theme}</title>`,
    stylesheets,
    '</head>',
    '<body>',
    `<div id="gaia-root">${screenMarkupOf(screen, theme)}</div>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
