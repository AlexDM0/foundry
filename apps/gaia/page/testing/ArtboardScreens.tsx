/**
 * Test-only: each artboard Gaia's page builds, painted from its fixture as a whole document in either theme for the visual pass. A state
 * an artboard shows mid-use, such as the Stop dialog, is set in the view's own state; a state no artboard draws, which a later decision of
 * the owner added, is painted over the artboard it changes.
 */
import { readFileSync }         from 'node:fs';
import { join }                 from 'node:path';
import { pathToFileURL }        from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';

import { MarkdownBlocks }                                               from '../../src/lib/markdown-render/MarkdownBlocks.ts';
import type { CommandAnswerDocument, ForgeCommandBody }                 from '../@types/CommandDocument.ts';
import type { FleetDocument }                                           from '../@types/FleetDocument.ts';
import type { BoardDecisionDocument }                                   from '../@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument }                                           from '../@types/board/BoardDocument.ts';
import type { BoardTicketDocument }                                     from '../@types/board/BoardTicketDocuments.ts';
import type { BoardTicketDocumentKind }                                 from '../@types/board/BoardVocabulary.ts';
import type { BoardTranscriptEntryDocument }                            from '../@types/board/ConversationDocument.ts';
import type { GaiaTicketDocumentsDocument }                             from '../@types/board/TicketDocumentsDocument.ts';
import { type CommandSender, CommandSenderContext, type CommandStates } from '../api/CommandSender.ts';
import type { BoardServices }                                           from '../board/@types/BoardServices.ts';
import { PaintedTranscriptsContext }                                    from '../board/conversation/TranscriptLog.tsx';
import { ControlSurroundingsContext, type ControlSurroundings }         from '../board/shared/commands/ControlAvailability.ts';
import { BoardGoToContext, BoardTrackerContext }                        from '../board/shared/routing/BoardRouteLinks.ts';
import { pipelineBoardStateOf }                                         from '../board/testing/PipelineFixture.ts';
import {
  DOCUMENT_STATES,
  DOCUMENTS_PROJECT,
  documentsTicketOf,
  lineOf,
  PLAN_MARKDOWN,
  PLAN_OUT_OF_DATE_TRANSCRIPT,
  PLAN_TRANSCRIPT,
  SAVED_CHOICE_QUESTION,
  SPEC_ASKS_DOCUMENTS,
  SPEC_MARKDOWN,
  SPEC_MARKDOWN_V6,
  SPEC_TRANSCRIPT_AFTER_C1,
  SPEC_TRANSCRIPT_ASKS,
  SPEC_TRANSCRIPT_IDLE,
  SPEC_TRANSCRIPT_SPLIT,
  SPEC_TRANSCRIPT_WORKING
} from '../board/testing/TicketDocumentsFixture.ts';
import type { CommentDraft }                                                                          from '../board/views/documents/CommentPopover.tsx';
import { bringOpenQuestionToChatTop, letChatTopFallBetweenItems }                                     from '../board/views/documents/DocumentChat.tsx';
import { DocumentSelectionModel }                                                                     from '../board/views/documents/DocumentSelectionModel.ts';
import { followCaretIn }                                                                              from '../board/views/documents/DocumentSplitView.tsx';
import { scrollToLines, TicketDocumentsPage, type PageStateAtMount }                                  from '../board/views/documents/TicketDocumentsView.tsx';
import { FirstOpenPhaseContext }                                                                      from '../board/views/pipeline/flow/FlowSelection.ts';
import type { PipelinePhase }                                                                         from '../board/views/pipeline/flow/PipelinePhaseModel.ts';
import type { SetupProgress }                                                                         from '../shared/@types/SetupProgress.ts';
import { BoardRouter, type BoardRoute }                                                               from '../shared/BoardRouter.ts';
import { HashRouter }                                                                                 from '../shared/HashRouter.ts';
import { GaiaShell, viewPartsOf }                                                                     from '../shell/GaiaApp.tsx';
import type { OpenForgeSetup }                                                                        from '../shell/RailModel.ts';
import { ForgesLayout }                                                                               from '../views/forges/ForgesLayout.tsx';
import { ForgesModel, type StopDialogState }                                                          from '../views/forges/ForgesModel.ts';
import { GaiaPanelModel }                                                                             from '../views/forges/GaiaPanelModel.ts';
import { WhatNotifiesDialog }                                                                         from '../views/forges/WhatNotifiesDialog.tsx';
import { DesignSystemStylesheet }                                                                     from './DesignSystemStylesheet.ts';
import { PackageStylesheet }                                                                          from './PackageStylesheet.ts';
import { type PipelineDocumentArtboard, pipelineDocumentDialogMarkupOf, type PipelineDocumentScreen } from './PipelineDocumentArtboards.tsx';
import { forgeViewSurroundingsAt, silentBoardServicesOf }                                             from './ShellSurroundingsAt.ts';
import { FLEET_AT_LIMIT }                                                                             from './fixtures/fleet-at-limit.ts';
import { FLEET_DEGRADED }                                                                             from './fixtures/fleet-degraded.ts';
import { FLEET_EMPTY }                                                                                from './fixtures/fleet-empty.ts';
import {
  FLEET_FIVE_FORGES,
  FLEET_FIVE_FORGES_READINGS,
  FLEET_FIVE_FORGES_TRACKER_IDS,
  FLEET_FIXTURES_READ_AT
} from './fixtures/fleet-five-forges.ts';
import { FLEET_OUTAGE_ENDINGS }                                                                   from './fixtures/fleet-outage-endings.ts';
import { FLEET_STOREFRONT_CRASHED, FLEET_STOREFRONT_STARTED_AFTER_A_CRASH, STOREFRONT_CRASH_LOG } from './fixtures/fleet-storefront-crashed.ts';
import { FLEET_STOREFRONT_IN_SETUP }                                                              from './fixtures/fleet-storefront-in-setup.ts';
import { FLEET_VERSIONS, FLEET_VERSIONS_TRACKER_IDS }                                             from './fixtures/fleet-versions.ts';
import { storefrontBoardOf }                                                                      from './fixtures/storefront-board.ts';
import { STOREFRONT_ONE_TICKET_BOARD, STOREFRONT_TICKETS_BOARD }                                  from './fixtures/storefront-tickets-board.ts';

export type ScreenTheme = 'dark' | 'light';

/** Both themes are designed, and every screen is built and checked in each; light is the package's default. */
export const SCREEN_THEMES: readonly ScreenTheme[] = ['light', 'dark'];

/** Every artboard Gaia's page builds is drawn at this size. */
export const ARTBOARD_SIZE_PIXELS = { width: 1440, height: 1016 } as const;

/** The artboards of `docs/design/screens.md`, by their mark. The notifications dialog is painted over Forges; the splash is a page of its own. */
export type PageArtboard = 'A1' | 'A2' | 'A3' | 'A4' | 'B1' | 'B2' | 'B3' | 'B4';

/**
 * How the view of a screen is set: as the route shows it, with Start and Stop in use, after an update that left a restart pending, or with
 * Example Billing's Update forge on its way, done with its restart pending, or refused (the Versions boards' `update` tweak).
 */
type ScreenViewState = 'as-routed' | 'forge-controls-in-use' | 'restart-pending' | 'forge-update-pending' | 'forge-update-done' | 'forge-update-refused';

export interface ArtboardScreen {
  readonly artboard:      PageArtboard;
  readonly title:         string;
  /** The artboard's name among the owner's drawings (`docs/design/README.md`). */
  readonly designFile:    string;
  readonly fleetDocument: FleetDocument;
  readonly fragment:      string;
  readonly viewState:     ScreenViewState;
}

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

/** The forge in place: Example Storefront at its open question. */
const STOREFRONT_IN_PLACE_FRAGMENT = HashRouter.fragmentOf({ view: 'forge', trackerId: TRACKER_IDS.exampleStorefront, boardRoute: { tab: 'questions', item: 'E2' } });

const BRAND_STYLESHEET_PAGE_PATH = 'lib/brand/styles/brand.css';

const PAGE_FOLDER = join(import.meta.dir, '..');

const PAGE_OWN_STYLESHEET_LINK = /href="\.\/(styles\/[^"]+\.css)"/g;

/** Gaia's own stylesheets and the board's, in the order the page links them, so a screen with a board in it is drawn as the page draws it. */
function pageOwnStylesheetPaths(): string[] {
  const pageDocument = readFileSync(join(PAGE_FOLDER, 'index.html'), 'utf8');
  return [...pageDocument.matchAll(PAGE_OWN_STYLESHEET_LINK)].flatMap((match) => (match[1] === undefined ? [] : [join(PAGE_FOLDER, match[1])]));
}

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
    fleetDocument: FLEET_FIVE_FORGES,
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
    fleetDocument: FLEET_FIVE_FORGES,
    fragment:      STOREFRONT_IN_PLACE_FRAGMENT,
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

/**
 * Example Mobile App, held since its install version changed, after an Update forge whose restart its live Hephaestus did not take.
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

/** The sentence a forge at monitor contract 2 sends with its warning that a restart failed, which names no command. */
export const RESTART_FAILED_SENTENCE = 'the restart to code 4c1d9e2 failed at preflight: the code on disk did not start; this Hephaestus keeps driving';

/** The notice that Research Wiki's Assistant cannot come up, as the server words it in Gaia's words. */
export const ASSISTANT_DOWN_SENTENCE = 'This forge\'s Assistant cannot come up, so its open incidents take their defaults.';

/** Invoice Service warns that its restart failed, so Attention shows that look before the two the artboard draws. */
const FLEET_RESTART_FAILED: FleetDocument = {
  ...FLEET_FIVE_FORGES,
  forges: FLEET_FIVE_FORGES.forges.map((forge) => (forge.trackerId === TRACKER_IDS.invoiceService
    ? { ...forge, warnings: [{ kind: 'restart-failed', text: RESTART_FAILED_SENTENCE }] }
    : forge)),
  needsALook: [{ trackerId: TRACKER_IDS.invoiceService, kind: 'restart-failed' }, ...FLEET_FIVE_FORGES.needsALook],
};

/** Research Wiki's Assistant cannot come up: a notice under its row on Forges. */
const FLEET_ASSISTANT_DOWN: FleetDocument = {
  ...FLEET_FIVE_FORGES,
  forges: FLEET_FIVE_FORGES.forges.map((forge) => (forge.trackerId === TRACKER_IDS.researchWiki
    ? { ...forge, notices: [{ kind: 'assistant-down', text: ASSISTANT_DOWN_SENTENCE }] }
    : forge)),
};

/** The warnings of monitor contract 2, which no artboard draws, each over the artboard that shows it. */
export const MONITOR_WARNING_SCREENS: readonly ArtboardScreen[] = [
  {
    artboard:      'A1',
    title:         'Attention, a restart failed',
    designFile:    'Main.dc.html',
    fleetDocument: FLEET_RESTART_FAILED,
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

/** An owner's decision no artboard draws: the agents a network outage stopped, the alert heading Attention and each forge's count on Forges. */
export const OUTAGE_ENDINGS_SCREENS: readonly ArtboardScreen[] = [
  {
    artboard:      'A1',
    title:         'Attention, agents stopped on a network outage',
    designFile:    'Main.dc.html',
    fleetDocument: FLEET_OUTAGE_ENDINGS,
    fragment:      '#attention',
    viewState:     'as-routed',
  },
  {
    artboard:      'A4',
    title:         'Forges, agents stopped on a network outage',
    designFile:    'Forges.dc.html',
    fleetDocument: FLEET_OUTAGE_ENDINGS,
    fragment:      '#forges',
    viewState:     'as-routed',
  },
];

/** An owner's answer no artboard draws: a forge in place, off after a crash with its summary, then started again with its crash log open. */
export const CRASHED_FORGE_SCREENS: readonly ArtboardScreen[] = [
  {
    artboard:      'B1',
    title:         'A forge off after a crash',
    designFile:    'Forge.dc.html',
    fleetDocument: FLEET_STOREFRONT_CRASHED,
    fragment:      STOREFRONT_IN_PLACE_FRAGMENT,
    viewState:     'as-routed',
  },
  {
    artboard:      'B1',
    title:         'A forge started again after a crash, its crash log open',
    designFile:    'Forge.dc.html',
    fleetDocument: FLEET_STOREFRONT_STARTED_AFTER_A_CRASH,
    fragment:      STOREFRONT_IN_PLACE_FRAGMENT,
    viewState:     'as-routed',
  },
];

/** Forges draws a seventh forge, Old Prototype, hidden in Gaia: dormant since 3 November, its row folded under "Hidden in Gaia". */
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

/** The Forges artboard's hidden forge, which the five forges' fixture does not hold: its figure and folded group, over the artboard. */
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

/** No forge yet, with the forge program found where Gaia looks for it, the state the board's `forgeProgram` tweak calls `found`. */
const FLEET_EMPTY_FORGE_PROGRAM_FOUND: FleetDocument = {
  ...FLEET_EMPTY,
  gaia: { ...FLEET_EMPTY.gaia, forgeProgramInUse: `${FLEET_EMPTY.gaia.homeFolder}/.bun/bin/forge` },
};

/** The "No forge yet" artboard's second state: it paints the forge program missing, as `ARTBOARD_SCREENS` does, and found. */
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

/** The Versions boards' pages, Attention, Forges and the forge in place, over forges at each version this Gaia, built for forge 3.1, meets. */
export type VersionsBoard = 'U1' | 'U2' | 'U3';

/** The step of Example Billing's Update forge a Versions screen shows, as the boards' `update` tweak names it. */
export type ForgeUpdateStep = 'idle' | 'pending' | 'done' | 'refused';

export interface VersionsScreen extends ArtboardScreen {
  readonly board:            VersionsBoard;
  /** The name of the board's render, without its theme: `U3-forge-older-pending`. */
  readonly renderName:       string;
  /** The forge whose versions pair the Forges view shows open under its row (the Forges board's `versionsOf` tweak); `null` for every pair closed. */
  readonly versionsShownFor: string | null;
  readonly updateStep:       ForgeUpdateStep;
}

const VERSIONS_VIEW_STATES: Readonly<Record<ForgeUpdateStep, ScreenViewState>> = {
  idle:    'as-routed',
  pending: 'forge-update-pending',
  done:    'forge-update-done',
  refused: 'forge-update-refused',
};

/** The Forges board's `versionsOf` tweak: each forge at a version other than this Gaia's, its pair open, and every pair closed. */
const U2_VERSIONS_SHOWN_FOR: readonly (readonly [renderName: string, trackerId: string | null])[] = [
  ['U2-forges-example-billing', FLEET_VERSIONS_TRACKER_IDS.exampleBilling],
  ['U2-forges-analytics-sandbox', FLEET_VERSIONS_TRACKER_IDS.analyticsSandbox],
  ['U2-forges-example-storefront', FLEET_VERSIONS_TRACKER_IDS.exampleStorefront],
  ['U2-forges-none', null],
];

/** The in-place board's `case` and `update` tweaks as the boards render them: the newer and ahead forges idle, the older one at every step. */
const U3_FORGES_IN_PLACE: readonly (readonly [renderName: string, trackerId: string, updateStep: ForgeUpdateStep])[] = [
  ['U3-forge-newer', FLEET_VERSIONS_TRACKER_IDS.analyticsSandbox, 'idle'],
  ['U3-forge-older', FLEET_VERSIONS_TRACKER_IDS.exampleBilling, 'idle'],
  ['U3-forge-older-pending', FLEET_VERSIONS_TRACKER_IDS.exampleBilling, 'pending'],
  ['U3-forge-older-done', FLEET_VERSIONS_TRACKER_IDS.exampleBilling, 'done'],
  ['U3-forge-older-refused', FLEET_VERSIONS_TRACKER_IDS.exampleBilling, 'refused'],
  ['U3-forge-ahead', FLEET_VERSIONS_TRACKER_IDS.exampleStorefront, 'idle'],
];

/**
 * The Versions boards (`docs/design/versions.md`), each over the artboard whose page it is, from the fleet-versions fixture: Attention with
 * its two callouts, Forges with each pair open and none, and each forge in place at its version and Example Billing at each update step.
 */
export const VERSIONS_SCREENS: readonly VersionsScreen[] = [
  {
    board:            'U1',
    renderName:       'U1-attention',
    artboard:         'A1',
    title:            'Attention, forges at other versions',
    designFile:       'VersionsAttention.dc.html',
    fleetDocument:    FLEET_VERSIONS,
    fragment:         '#attention',
    viewState:        'as-routed',
    versionsShownFor: null,
    updateStep:       'idle',
  },
  ...U2_VERSIONS_SHOWN_FOR.map(([renderName, versionsShownFor]) => ({
    board:         'U2' as const,
    renderName,
    artboard:      'A4' as const,
    title:         `Forges, the versions of ${versionsShownFor ?? 'no forge'} shown`,
    designFile:    'VersionsForges.dc.html',
    fleetDocument: FLEET_VERSIONS,
    fragment:      '#forges',
    viewState:     'as-routed' as const,
    versionsShownFor,
    updateStep:    'idle' as const,
  })),
  ...U3_FORGES_IN_PLACE.map(([renderName, trackerId, updateStep]) => ({
    board:            'U3' as const,
    renderName,
    artboard:         'B1' as const,
    title:            `A forge in place at another version, ${renderName.replace('U3-forge-', '')}`,
    designFile:       trackerId === FLEET_VERSIONS_TRACKER_IDS.exampleBilling ? 'VersionsForgeBehind.dc.html' : 'VersionsForge.dc.html',
    fleetDocument:    FLEET_VERSIONS,
    fragment:         HashRouter.fragmentOf({ view: 'forge', trackerId, boardRoute: null }),
    viewState:        VERSIONS_VIEW_STATES[updateStep],
    versionsShownFor: null,
    updateStep,
  })),
];

/** The forge's refusal of Example Billing's Update forge, as the Versions boards word it. */
export const VERSIONS_UPDATE_REFUSAL: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'repository-busy',
  text:          'Another forge command holds the repository.',
  forges:        [],
};

const EXAMPLE_BILLING_TRACKER_ID = FLEET_VERSIONS_TRACKER_IDS.exampleBilling;

function exampleBillingUpdateStatesOf(updateStep: Exclude<ForgeUpdateStep, 'idle'>): CommandStates {
  const state = {
    pending: { onItsWay: 'forge-update' as const, failure: null, restartPending: false },
    done:    { onItsWay: null, failure: null, restartPending: true },
    refused: { onItsWay: null, failure: { kind: 'forge-update' as const, result: { verdict: 'answered' as const, answer: VERSIONS_UPDATE_REFUSAL } }, restartPending: false },
  }[updateStep];
  return { forges: new Map([[EXAMPLE_BILLING_TRACKER_ID, state]]), fleet: new Map(), fleetAnswers: new Map() };
}

/** The Stop refusal: the forge's own code and sentence, as the artboard words them. */
export const B2_STOP_REFUSAL: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'hephaestus-still-live',
  text:          'Hephaestus did not stop within its tries.',
  forges:        [],
};

/** Start and stop in use: Example Mobile App's Stop refused and kept until dismissed, Design System's `forge start` on its way. */
const B2_COMMAND_STATES: CommandStates = {
  forges: new Map([
    [TRACKER_IDS.exampleMobileApp, { onItsWay: null, failure: { kind: 'forge-stop', result: { verdict: 'answered', answer: B2_STOP_REFUSAL } }, restartPending: false }],
    [TRACKER_IDS.designSystem, { onItsWay: 'forge-start', failure: null, restartPending: false }],
  ]),
  fleet:        new Map(),
  fleetAnswers: new Map(),
};

const RESTART_PENDING_COMMAND_STATES: CommandStates = {
  forges:       new Map([[TRACKER_IDS.exampleMobileApp, { onItsWay: null, failure: null, restartPending: true }]]),
  fleet:        new Map(),
  fleetAnswers: new Map(),
};

const B2_STOP_DIALOG: StopDialogState = { trackerId: TRACKER_IDS.exampleStorefront, agents: 'keep' };

/** The Stop the view sent Example Mobile App, which its "Try again" sends again. */
const B2_LAST_SENT: ReadonlyMap<string, ForgeCommandBody> = new Map([
  [TRACKER_IDS.exampleMobileApp, { kind: 'forge-stop', trackerId: TRACKER_IDS.exampleMobileApp, agents: 'keep' }],
]);

const NO_COMMAND_STATES: CommandStates = { forges: new Map(), fleet: new Map(), fleetAnswers: new Map() };

function doNothing(): void {
  return undefined;
}

/** A sender that holds the screen's command states and sends nothing: a screen is painted, never used. */
function senderHolding(commandStates: CommandStates): CommandSender {
  return {
    send:                  () => Promise.reject(new Error('A screen of the visual pass sends no command.')),
    dismissFailure:        doNothing,
    dismissRestartPending: doNothing,
    dismissAnswer:         doNothing,
    states:                () => commandStates,
    subscribe:             () => doNothing,
  };
}

interface ForgesLaidOut {
  readonly commandStates:    CommandStates;
  readonly stopDialog:       StopDialogState | null;
  readonly lastSent:         ReadonlyMap<string, ForgeCommandBody>;
  readonly versionsShownFor: string | null;
}

/** The Forges view as its root lays it out, with the state the root keeps set as the screen needs it. */
function forgesLaidOut(fleetDocument: FleetDocument, {
  commandStates, stopDialog, lastSent, versionsShownFor
}: ForgesLaidOut) {
  const content = ForgesModel.forgesContentOf(fleetDocument, {
    clock:       { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' },
    commandStates,
    stopDialog,
    forgeInView: null,
    lastSent,
    versionsShownFor,
  });
  return (
    <ForgesLayout
      content={content}
      gaiaPanel={GaiaPanelModel.gaiaPanelOf(fleetDocument, { commandStates, sentSettingsChange: null })}
      commandStates={commandStates}
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
        onToggleVersions:        doNothing,
      }}
    />
  );
}

/** The view's own state for a screen whose root keeps more than the route says: the start and stop controls in use, or a row's versions shown. */
function viewContentOf(screen: ArtboardScreen, fleetDocument: FleetDocument) {
  if (screen.viewState === 'forge-controls-in-use') {
    return forgesLaidOut(fleetDocument, {
      commandStates: B2_COMMAND_STATES, stopDialog: B2_STOP_DIALOG, lastSent: B2_LAST_SENT, versionsShownFor: null
    });
  }
  const versionsShownFor = 'versionsShownFor' in screen && typeof screen.versionsShownFor === 'string' ? screen.versionsShownFor : null;
  if (versionsShownFor === null) return null;
  return forgesLaidOut(fleetDocument, {
    commandStates: commandStatesOf(screen.viewState), stopDialog: null, lastSent: new Map(), versionsShownFor
  });
}

function commandStatesOf(viewState: ScreenViewState): CommandStates {
  switch (viewState) {
    case 'as-routed':
      return NO_COMMAND_STATES;
    case 'forge-controls-in-use':
      return B2_COMMAND_STATES;
    case 'restart-pending':
      return RESTART_PENDING_COMMAND_STATES;
    case 'forge-update-pending':
      return exampleBillingUpdateStatesOf('pending');
    case 'forge-update-done':
      return exampleBillingUpdateStatesOf('done');
    case 'forge-update-refused':
      return exampleBillingUpdateStatesOf('refused');
  }
}

/** The theme the screen is shown in is the one chosen in Gaia's settings, so the theme button shows that theme. */
function fleetDocumentInTheme(fleetDocument: FleetDocument, theme: ScreenTheme): FleetDocument {
  return { ...fleetDocument, settings: { ...fleetDocument.settings, theme } };
}

/**
 * A painted screen runs no read, so Example Storefront in place shows its board as read over a live stream while it serves, and a lost
 * stream with no board while it does not; any other forge's board waits for its first.
 */
function screenBoardServicesOf(fleetDocument: FleetDocument, storefrontBoard: BoardDocument | null): (trackerId: string) => BoardServices {
  const storefront = fleetDocument.forges.find((forge) => forge.trackerId === TRACKER_IDS.exampleStorefront);
  return (trackerId) => {
    const services = silentBoardServicesOf(trackerId);
    if (trackerId !== TRACKER_IDS.exampleStorefront || storefront === undefined) return services;
    const board = storefrontBoard === null ? storefrontBoardOf(trackerId) : { ...storefrontBoard, trackerId };
    const readingAtMount = storefront.presence.state === 'serving'
      ? { board, connection: 'live' as const }
      : { board: null, connection: 'down' as const };
    return { ...services, readingAtMount };
  };
}

/**
 * The shell as the page paints it for the screen: the brand bar, the rail, the page title and the view, with every control live. A
 * screen that draws a board of its own gives it as Example Storefront's, and the transcripts its chats show by job id.
 */
export function screenMarkupOf(
  screen: ArtboardScreen,
  theme: ScreenTheme,
  storefrontBoard: BoardDocument | null = null,
  firstOpenPhase: PipelinePhase = 'build',
  paintedTranscripts: ReadonlyMap<string, readonly BoardTranscriptEntryDocument[]> = new Map(),
  openForgeSetup: OpenForgeSetup | null = null,
): string {
  const fleetDocument = fleetDocumentInTheme(screen.fleetDocument, theme);
  const route = HashRouter.routeOf(screen.fragment);
  const routedParts = viewPartsOf(route, fleetDocument, {
    readAtMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT),
    timeZone:           'UTC',
    goTo:               doNothing,
    forgeView:          {
      ...forgeViewSurroundingsAt(),
      boardServicesOf:      screenBoardServicesOf(fleetDocument, storefrontBoard),
      crashLogsReadAtMount: (trackerId) => (trackerId === TRACKER_IDS.exampleStorefront ? [STOREFRONT_CRASH_LOG] : []),
    },
  });
  const viewContent = viewContentOf(screen, fleetDocument);
  const view = viewContent === null ? routedParts : { ...routedParts, content: viewContent };
  return renderToStaticMarkup(
    <CommandSenderContext value={senderHolding(commandStatesOf(screen.viewState))}>
      <FirstOpenPhaseContext value={firstOpenPhase}>
        <PaintedTranscriptsContext value={paintedTranscripts}>
          <GaiaShell
            fleetDocument={fleetDocument}
            streamState="live"
            route={route}
            view={view}
            themeChoice={theme}
            onThemeChoice={doNothing}
            openForgeSetup={openForgeSetup}
          />
        </PaintedTranscriptsContext>
      </FirstOpenPhaseContext>
    </CommandSenderContext>,
  );
}

/**
 * A whole page for a browser: the theme set on the root as the page sets it before its first paint, motion off as before the first document
 * has painted, so no fade or pulse is caught mid-way, and the stylesheets inline in the page's order, the design system's fonts and
 * stylesheet, then the brand's, before Gaia's and the board's.
 */
export function screenDocumentOf(screen: ArtboardScreen, theme: ScreenTheme): string {
  return documentAround(`${screen.artboard} ${screen.title}, ${theme}`, theme, `<div id="gaia-root">${screenMarkupOf(screen, theme)}</div>`);
}

/** A whole page around a body, the theme on its root and the stylesheets inline in the page's order, for a browser to open. */
export function documentAround(title: string, theme: ScreenTheme, bodyMarkup: string): string {
  const stylesheetTexts = [
    DesignSystemStylesheet.fontFaceRules(),
    DesignSystemStylesheet.text(),
    PackageStylesheet.inlinedText(BRAND_STYLESHEET_PAGE_PATH),
    ...pageOwnStylesheetPaths().map((stylesheetPath) => readFileSync(stylesheetPath, 'utf8')),
  ];
  const stylesheets = stylesheetTexts.map((stylesheetText) => `<style>\n${stylesheetText}</style>`).join('\n');
  return [
    '<!doctype html>',
    `<html lang="en" data-theme="${theme}">`,
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

/** The "What notifies" dialog as the page builds it, over the Forges view it opens from, its kinds as the fixture's settings set them. */
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

/** The two steps the splash's `step` tweak draws: the server starting, and the window about to open on Gaia's page. */
export type SplashStepShown = 'starting' | 'opening';

export interface SplashScreen {
  readonly artboard:   'C3';
  readonly designFile: 'Splash.dc.html';
  readonly step:       SplashStepShown;
}

/** The splash is drawn at this size, smaller than the window the launcher opens. */
export const SPLASH_SIZE_PIXELS = { width: 900, height: 560 } as const;

/** The mark's size on the splash (`docs/design/components.md` 3.1). */
export const SPLASH_MARK_SIZE_PIXELS = 88;

/** The address the splash draws on its `opening` step. */
const SPLASH_SERVER_ADDRESS = '127.0.0.1:4790';

export const SPLASH_PAGE_PATH = join(import.meta.dir, '..', '..', 'resources', 'page', 'loading.html');

export const SPLASH_SCREENS: readonly SplashScreen[] = [
  { artboard: 'C3', designFile: 'Splash.dc.html', step: 'starting' },
  { artboard: 'C3', designFile: 'Splash.dc.html', step: 'opening' },
];

/**
 * The splash's own file at a step, as the launcher addresses it: Gaia's address and the theme in the query, the step in the fragment. A
 * browser opens it at the splash artboard's size; the splash is a file page and is shown as it is, never rebuilt.
 */
export function splashScreenAddressOf(screen: SplashScreen, theme: ScreenTheme): string {
  const splashAddress = pathToFileURL(SPLASH_PAGE_PATH);
  splashAddress.search = new URLSearchParams({ address: SPLASH_SERVER_ADDRESS, theme }).toString();
  splashAddress.hash = new URLSearchParams({ step: screen.step }).toString();
  return splashAddress.href;
}

/** The ticket document artboards, 1 to 8 and 11 of the spec and plan design, each by its file among the owner's drawings. */
export type TicketDocumentArtboard = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 11;

export interface TicketDocumentScreen {
  readonly artboard:     TicketDocumentArtboard;
  readonly title:        string;
  readonly designFile:   string;
  readonly documents:    GaiaTicketDocumentsDocument;
  readonly shown:        BoardTicketDocumentKind;
  readonly transcript:   readonly BoardTranscriptEntryDocument[];
  readonly ticket:       BoardTicketDocument;
  readonly atMount:      PageStateAtMount;
  /** The board's open decisions the page reads its agent's questions from; none where the artboard draws none. */
  readonly decisions?:   readonly BoardDecisionDocument[];
  /** The draft "Next waiting on you" opens; absent where the artboard draws no such link. */
  readonly nextWaiting?: BoardRoute;
}

const SPEC_BLOCKS = MarkdownBlocks.blocksOf(SPEC_MARKDOWN);

const SPEC_LINE_COUNT = SPEC_MARKDOWN.split('\n').length;

/** The spec version the idle screens show, which their comments are made on. */
const SPEC_HEAD_NUMBER = DOCUMENT_STATES.specIdle.documents[0]?.head?.number ?? 1;

const OUTCOME_QUOTE = 'with no white flash on load.';

const OUTCOME_LINE = lineOf(SPEC_MARKDOWN, OUTCOME_QUOTE);

const OUTCOME_COLUMN = (SPEC_MARKDOWN.split('\n')[OUTCOME_LINE - 1] ?? '').indexOf(OUTCOME_QUOTE) + 1;

const OUTCOME_SELECTION = {
  start: { line: OUTCOME_LINE, column: OUTCOME_COLUMN },
  end:   { line: OUTCOME_LINE, column: OUTCOME_COLUMN + OUTCOME_QUOTE.length },
  quote: OUTCOME_QUOTE,
};

/** Artboard 2's comment on the Outcome's last words, as a selection in Preview gives it. */
const OUTCOME_COMMENT: CommentDraft = {
  commentNumber: 3,
  anchor:        DocumentSelectionModel.anchorOfPreviewSelection(SPEC_BLOCKS, SPEC_LINE_COUNT, SPEC_HEAD_NUMBER, OUTCOME_SELECTION),
};

/** Artboard 4's acceptance line `**A3**`, which the agent's edit for a comment replaces, as a press on that comment's card jumps to it. */
const CONTRAST_LINES = { from: lineOf(SPEC_MARKDOWN, '**A3**'), to: lineOf(SPEC_MARKDOWN, '**A3**') };

/** The theme flow's mermaid block in the spec, fence to fence. */
const THEME_FLOW_LINES = { from: lineOf(SPEC_MARKDOWN, '```mermaid'), to: lineOf(SPEC_MARKDOWN, 'Paint --> Account') + 1 };

/** Artboard 3's comment on the theme flow's lines in Code. */
const THEME_FLOW_COMMENT: CommentDraft = {
  commentNumber: 3,
  anchor:        DocumentSelectionModel.anchorOfLines(SPEC_BLOCKS, SPEC_LINE_COUNT, SPEC_HEAD_NUMBER, THEME_FLOW_LINES),
};

const THEME_FLOW = DocumentSelectionModel.diagramAtLine(SPEC_BLOCKS, THEME_FLOW_LINES.from);

/** Artboard 6's comment on the diagram's Saved choice node. */
const SAVED_CHOICE_COMMENT: CommentDraft | null = THEME_FLOW === null ? null : {
  commentNumber: 3,
  anchor:        DocumentSelectionModel.anchorOfNode(SPEC_BLOCKS, SPEC_LINE_COUNT, SPEC_HEAD_NUMBER, THEME_FLOW, { nodeId: 'Stored', label: 'Saved choice' }),
};

/** Artboard 8's step 2, which the plan agent's edit for spec v6 replaces, as the notice's See the proposed plan update jumps to it. */
const PLAN_STEP_TWO_LINES = { from: lineOf(PLAN_MARKDOWN, '2. Resolver'), to: lineOf(PLAN_MARKDOWN, '2. Resolver') };

export const TICKET_DOCUMENT_SCREENS: readonly TicketDocumentScreen[] = [
  {
    artboard:   1,
    title:      'Spec in Preview with the spec agent',
    designFile: 'Main.dc.html',
    documents:  DOCUMENT_STATES.specWorking,
    shown:      'spec',
    transcript: SPEC_TRANSCRIPT_WORKING,
    ticket:     documentsTicketOf(),
    atMount:    {},
  },
  {
    artboard:   2,
    title:      'Comment on a selection in Preview',
    designFile: 'Comment-preview.dc.html',
    documents:  DOCUMENT_STATES.specIdle,
    shown:      'spec',
    transcript: SPEC_TRANSCRIPT_IDLE,
    ticket:     documentsTicketOf(),
    atMount:    { draft: OUTCOME_COMMENT, draftText: 'Measurable? Say how a reviewer sees a flash.' },
  },
  {
    artboard:   3,
    title:      'Comment on lines in Code',
    designFile: 'Comment-code.dc.html',
    documents:  DOCUMENT_STATES.specIdleAfterC1,
    shown:      'spec',
    transcript: SPEC_TRANSCRIPT_AFTER_C1,
    ticket:     documentsTicketOf(),
    atMount:    { view: 'code', draft: THEME_FLOW_COMMENT, draftText: 'Server-rendered pages paint before the resolver runs. Put the server path in the flow.' },
  },
  {
    artboard:   4,
    title:      'The agent answers on the anchor',
    designFile: 'Agent-proposal.dc.html',
    documents:  DOCUMENT_STATES.specIdle,
    shown:      'spec',
    transcript: SPEC_TRANSCRIPT_IDLE,
    ticket:     documentsTicketOf(),
    atMount:    { jumpedTo: CONTRAST_LINES },
  },
  {
    artboard:   5,
    title:      'Edit freely while the agent works',
    designFile: 'Split-edit.dc.html',
    documents:  DOCUMENT_STATES.specSplit,
    shown:      'spec',
    transcript: SPEC_TRANSCRIPT_SPLIT,
    ticket:     documentsTicketOf(),
    atMount:    { view: 'split', editedText: `${SPEC_MARKDOWN_V6}\n`, caretLine: lineOf(SPEC_MARKDOWN_V6, '#011') },
  },
  {
    artboard:   6,
    title:      'What a comment hands the agent',
    designFile: 'Anchor-payload.dc.html',
    documents:  DOCUMENT_STATES.specIdle,
    shown:      'spec',
    transcript: SPEC_TRANSCRIPT_IDLE,
    ticket:     documentsTicketOf(),
    atMount:    { draft: SAVED_CHOICE_COMMENT, draftText: 'Drop this if C4 finds nothing.' },
  },
  {
    artboard:   7,
    title:      'Plan with what it names',
    designFile: 'Plan.dc.html',
    documents:  DOCUMENT_STATES.plan,
    shown:      'plan',
    transcript: PLAN_TRANSCRIPT,
    ticket:     documentsTicketOf(),
    atMount:    { effectIsOpen: true },
  },
  {
    artboard:   8,
    title:      'Plan out of date',
    designFile: 'Plan-out-of-date.dc.html',
    documents:  DOCUMENT_STATES.planOutOfDate,
    shown:      'plan',
    transcript: PLAN_OUT_OF_DATE_TRANSCRIPT,
    ticket:     documentsTicketOf('committed', true),
    atMount:    { jumpedTo: PLAN_STEP_TWO_LINES },
  },
  {
    artboard:    11,
    title:       'The spec agent asks you on the spec',
    designFile:  'Agent-asks.dc.html',
    documents:   SPEC_ASKS_DOCUMENTS,
    shown:       'spec',
    transcript:  SPEC_TRANSCRIPT_ASKS,
    ticket:      documentsTicketOf(),
    atMount:     {},
    decisions:   [SAVED_CHOICE_QUESTION],
    nextWaiting: BoardRouter.documentsRouteOf('007', 'plan'),
  },
];

/** The documents artboards are drawn at this size. */
export const TICKET_DOCUMENT_ARTBOARD_SIZE_PIXELS = { width: 1440, height: 900 } as const;

/** Controls a painted screen offers live, which send nothing: a screen is painted, never used. */
const PAINTED_CONTROLS: ControlSurroundings = {
  availability:  'enabled',
  commandClient: { send: () => Promise.reject(new Error('A screen of the visual pass sends no command.')) },
  onInstallHeld: doNothing,
};

/** The documents page as the board's panel holds it, with every control live, painted from the screen's documents and transcript. */
export function ticketDocumentScreenMarkupOf(screen: TicketDocumentScreen): string {
  return renderToStaticMarkup(
    <BoardTrackerContext value={TRACKER_IDS.exampleStorefront}>
      <BoardGoToContext value={doNothing}>
        <ControlSurroundingsContext value={PAINTED_CONTROLS}>
          <div className="board-shell" style={{ height: `${TICKET_DOCUMENT_ARTBOARD_SIZE_PIXELS.height}px` }}>
            <main className="board-panel" data-tab="documents">
              <TicketDocumentsPage
                project={DOCUMENTS_PROJECT}
                ticket={screen.ticket}
                documents={screen.documents}
                shown={screen.shown}
                transcript={screen.transcript}
                atMount={screen.atMount}
                {...(screen.decisions === undefined ? {} : { decisions: screen.decisions })}
                {...(screen.nextWaiting === undefined ? {} : { nextWaiting: screen.nextWaiting })}
              />
            </main>
          </div>
        </ControlSurroundingsContext>
      </BoardGoToContext>
    </BoardTrackerContext>,
  );
}

/** A whole page for a browser, at the artboards' 1440 by 900, in the screen's theme. */
export function ticketDocumentScreenDocumentOf(screen: TicketDocumentScreen, theme: ScreenTheme): string {
  const bodyMarkup = `<div id="gaia-root">${ticketDocumentScreenMarkupOf(screen)}</div>${scrollScriptOf(screen)}`;
  return documentAround(`Documents ${screen.artboard} ${screen.title}, ${theme}`, theme, bodyMarkup);
}

/**
 * A painted page runs no effect, so the scroll an effect would leave is run once it is painted, by the page's own scroll: to the lines a
 * screen opened jumped to, Split's preview to the caret's block, and the comment popover into view where User's selection opened it.
 */
/** The editor scrolls its text, mirror and gutter together on the textarea's scroll, which a painted page fires none of: scroll all three. */
function caretLineInViewIn(editor: HTMLElement | null, caretLine: number): void {
  const input = editor?.querySelector<HTMLElement>('.board-markdown-editor-input');
  const line = editor?.querySelectorAll<HTMLElement>('.board-markdown-editor-gutter-line')[caretLine - 1];
  if (editor === null || editor === undefined || input === null || input === undefined || line === undefined) return;
  const overflow = line.getBoundingClientRect().bottom - input.getBoundingClientRect().bottom + line.offsetHeight / 2;
  if (overflow <= 0) return;
  for (const scrolled of editor.querySelectorAll<HTMLElement>('.board-markdown-editor-input, .board-markdown-editor-mirror, .board-markdown-editor-gutter')) {
    scrolled.scrollTop += overflow;
  }
}

function scrollScriptOf(screen: TicketDocumentScreen): string {
  const chatScript = '<script>document.fonts.ready.then(() => {'
    + `(${letChatTopFallBetweenItems.toString()})(document.querySelector('.board-document-chat'));`
    + `(${bringOpenQuestionToChatTop.toString()})(document.querySelector('.board-document-chat'));`
    + '});</script>';
  return chatScript + documentScrollScriptOf(screen);
}

function documentScrollScriptOf(screen: TicketDocumentScreen): string {
  const {
    jumpedTo, view, caretLine = null, draft = null
  } = screen.atMount;
  const scrollOf = (container: string, lines: { readonly from: number; readonly to: number }): string => (
    `<script>(${scrollToLines.toString()})(document.querySelector('${container}'), ${JSON.stringify(lines)});</script>`
  );
  if (jumpedTo !== undefined) return scrollOf('.board-document-main', jumpedTo);
  if (view === 'split' && caretLine !== null) {
    return `<script>(${caretLineInViewIn.toString()})(document.querySelector('.board-markdown-editor'), ${caretLine});`
      + `(${followCaretIn.toString()})(document.querySelector('.board-document-split-preview'));</script>`;
  }
  if (draft !== null) return '<script>document.querySelector(\'.board-document-popover\')?.scrollIntoView({ block: \'nearest\' });</script>';
  return '';
}

/** The phase each artboard draws open: 9 the Ticket phase it changes, 10 the Review phase its dialog edits a step of. */
const OPEN_PHASE_OF_PIPELINE_DOCUMENT_ARTBOARD: Readonly<Record<PipelineDocumentArtboard, PipelinePhase>> = { 9: 'ticket', 10: 'review' };

/** Example Storefront in place at the artboard's board route and phase, drawn from the artboard's board, with the dialog it draws over it. */
export function pipelineDocumentScreenMarkupOf(screen: PipelineDocumentScreen, theme: ScreenTheme): string {
  const storefrontInPlace: ArtboardScreen = {
    artboard:      'B1',
    title:         screen.title,
    designFile:    screen.designFile,
    fleetDocument: FLEET_FIVE_FORGES,
    fragment:      HashRouter.fragmentOf({ view: 'forge', trackerId: TRACKER_IDS.exampleStorefront, boardRoute: screen.boardRoute }),
    viewState:     'as-routed',
  };
  const agentJobId = screen.board.pipeline.setup?.record.agentJobId ?? null;
  const paintedTranscripts = new Map(agentJobId === null ? [] : [[agentJobId, screen.agentTranscript]]);
  const boardMarkup = screenMarkupOf(storefrontInPlace, theme, screen.board, OPEN_PHASE_OF_PIPELINE_DOCUMENT_ARTBOARD[screen.artboard], paintedTranscripts);
  return boardMarkup + pipelineDocumentDialogMarkupOf(screen, TRACKER_IDS.exampleStorefront);
}

/** The page opens the pipeline agent's chat at its end, which a server render cannot, so the document scrolls it there once loaded. */
const OPEN_CHATS_AT_THEIR_END_SCRIPT = '<script>for (const body of document.querySelectorAll(\'.board-pipeline-panel-body\')) body.scrollTop = body.scrollHeight;</script>';

/**
 * The page opens a step's dialog on a double-click, after which the browser rings no control; a script's `showModal()` rings the first
 * one, so the screen lets that focus go.
 */
const SHOW_DIALOGS_OPENED_BY_POINTER_SCRIPT = '<script>for (const dialog of document.querySelectorAll(\'dialog\')) dialog.showModal(); document.activeElement?.blur();</script>';

/**
 * A whole page for a browser at the page's artboard size, in the screen's theme, with the agent's chat at its end and the artboard's dialog
 * shown as a modal.
 */
export function pipelineDocumentScreenDocumentOf(screen: PipelineDocumentScreen, theme: ScreenTheme): string {
  const dialogScript = screen.openRequest === null ? '' : `\n${SHOW_DIALOGS_OPENED_BY_POINTER_SCRIPT}`;
  const bodyMarkup = `<div id="gaia-root">${pipelineDocumentScreenMarkupOf(screen, theme)}</div>\n${OPEN_CHATS_AT_THEIR_END_SCRIPT}${dialogScript}`;
  return documentAround(`Documents ${screen.artboard} ${screen.title}, ${theme}`, theme, bodyMarkup);
}

/** The Tickets artboard, 0 of the spec and plan design, drawn at this size. */
export const TICKETS_ARTBOARD_SIZE_PIXELS = { width: 1680, height: 1180 } as const;

export interface TicketsScreen {
  readonly artboard:   '0';
  readonly title:      string;
  readonly designFile: 'TicketsSegmented.dc.html';
  readonly board:      BoardDocument;
  /** The segment the route opens Tickets on. */
  readonly segment:    'in-draft' | 'active' | 'finished';
}

/** Each segment of artboard 0 on the spec-then-plan route, and In draft again on the one-ticket route. */
export const TICKETS_SCREENS: readonly TicketsScreen[] = [
  {
    artboard: '0', title: 'Tickets, In draft', designFile: 'TicketsSegmented.dc.html', board: STOREFRONT_TICKETS_BOARD, segment: 'in-draft'
  },
  {
    artboard: '0', title: 'Tickets, Active', designFile: 'TicketsSegmented.dc.html', board: STOREFRONT_TICKETS_BOARD, segment: 'active'
  },
  {
    artboard: '0', title: 'Tickets, Finished', designFile: 'TicketsSegmented.dc.html', board: STOREFRONT_TICKETS_BOARD, segment: 'finished'
  },
  {
    artboard: '0', title: 'Tickets, In draft on the one-ticket route', designFile: 'TicketsSegmented.dc.html', board: STOREFRONT_ONE_TICKET_BOARD, segment: 'in-draft'
  },
];

/** Example Storefront in place on Tickets at the screen's segment, drawn from the screen's board. */
export function ticketsScreenMarkupOf(screen: TicketsScreen, theme: ScreenTheme): string {
  const storefrontOnTickets: ArtboardScreen = {
    artboard:      'B1',
    title:         screen.title,
    designFile:    screen.designFile,
    fleetDocument: FLEET_FIVE_FORGES,
    fragment:      HashRouter.fragmentOf({ view: 'forge', trackerId: TRACKER_IDS.exampleStorefront, boardRoute: { tab: 'tickets', item: screen.segment } }),
    viewState:     'as-routed',
  };
  return screenMarkupOf(storefrontOnTickets, theme, screen.board);
}

/** A whole page for a browser, opened at the artboard's 1680 by 1180, in the screen's theme. */
export function ticketsScreenDocumentOf(screen: TicketsScreen, theme: ScreenTheme): string {
  return documentAround(`Tickets ${screen.artboard} ${screen.title}, ${theme}`, theme, `<div id="gaia-root">${ticketsScreenMarkupOf(screen, theme)}</div>`);
}

/** The onboarding's screens, drawn at the page's artboard size. */
export interface SetupScreen {
  readonly title:         string;
  /** The artboard's name among the owner's onboarding drawings. */
  readonly designFile:    'onboarding/Main.dc.html' | 'onboarding/AgentStep.dc.html' | 'onboarding/ResearchStep.dc.html';
  readonly board:         BoardDocument;
  readonly boardRoute:    BoardRoute;
  /** Where the setup stands as the board tells the page once it shows, which a server render runs no effect to learn. */
  readonly setupProgress: SetupProgress;
}

/** The setup's board as Example Storefront's, named as the fleet names it; its open decisions stay, which the onboarding never shows. */
function boardInSetupOf(board: BoardDocument): BoardDocument {
  return { ...board, project: FLEET_FIVE_FORGES_READINGS.exampleStorefront.project };
}

/** Example Storefront with no pipeline yet: the welcome, the agent step that starts its setup, and the research step of an open setup. */
export const SETUP_SCREENS: readonly SetupScreen[] = [
  {
    title:         'Welcome to a new forge',
    designFile:    'onboarding/Main.dc.html',
    board:         boardInSetupOf(pipelineBoardStateOf('landing-found')),
    boardRoute:    { tab: 'pipeline', item: null },
    setupProgress: { stage: 'not-started' },
  },
  {
    title:         'Setup step 1, Agent',
    designFile:    'onboarding/AgentStep.dc.html',
    board:         boardInSetupOf(pipelineBoardStateOf('landing-found')),
    boardRoute:    { tab: 'pipeline', item: 'setup/agent' },
    setupProgress: { stage: 'setting-up', stepNumber: 1, stepCount: 6 },
  },
  {
    title:         'Setup step 3, Research',
    designFile:    'onboarding/ResearchStep.dc.html',
    board:         boardInSetupOf(pipelineBoardStateOf('A1')),
    boardRoute:    { tab: 'pipeline', item: 'setup/research' },
    setupProgress: { stage: 'setting-up', stepNumber: 3, stepCount: 6 },
  },
];

/** Example Storefront in place at the screen's setup route, drawn from the screen's board, its rail row saying where the setup stands. */
export function setupScreenMarkupOf(screen: SetupScreen, theme: ScreenTheme): string {
  const storefrontInSetup: ArtboardScreen = {
    artboard:      'B1',
    title:         screen.title,
    designFile:    screen.designFile,
    fleetDocument: FLEET_STOREFRONT_IN_SETUP,
    fragment:      HashRouter.fragmentOf({ view: 'forge', trackerId: TRACKER_IDS.exampleStorefront, boardRoute: screen.boardRoute }),
    viewState:     'as-routed',
  };
  const openForgeSetup: OpenForgeSetup = { trackerId: TRACKER_IDS.exampleStorefront, progress: screen.setupProgress };
  return screenMarkupOf(storefrontInSetup, theme, screen.board, 'build', new Map(), openForgeSetup);
}

/** A whole page for a browser at the page's artboard size, in the screen's theme. */
export function setupScreenDocumentOf(screen: SetupScreen, theme: ScreenTheme): string {
  return documentAround(`Onboarding ${screen.title}, ${theme}`, theme, `<div id="gaia-root">${setupScreenMarkupOf(screen, theme)}</div>`);
}
