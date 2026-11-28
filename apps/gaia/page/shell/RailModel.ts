/**
 * What the rail shows of a fleet document: the four views with their counts, one row per forge not hidden, and this machine's agents
 * against its limit. Every count is the document's own figure; one it does not hold is absent, never zero. A forge with no pipeline says
 * so under its name and may offer Set up in place of a count; its "no pipeline" question counts nowhere (`FleetDocumentUtil`).
 */
import type { FleetDocument, FleetDocumentForge }    from '../@types/FleetDocument.ts';
import type { DotCondition }                         from '../components/ConditionDot.tsx';
import type { SetupProgress }                        from '../shared/@types/SetupProgress.ts';
import type { BoardRoute }                           from '../shared/BoardRouter.ts';
import { type GaiaRoute, type GaiaView, HashRouter } from '../shared/HashRouter.ts';
import { type MachineLoad, MachineLoadModel }        from '../shared/MachineLoadModel.ts';
import { FleetDocumentUtil }                         from '../shared/utils/FleetDocumentUtil.ts';
import { ForgeContractUtil }                         from '../shared/utils/ForgeContractUtil.ts';
import { ForgeTextUtil }                             from '../shared/utils/ForgeTextUtil.ts';
import { ForgeVersionsTextUtil }                     from '../shared/utils/ForgeVersionsTextUtil.ts';

export type RailCountTone = 'attention' | 'muted';

/** `+` when a forge Gaia cannot read in full may hold more; `?` for an unreachable forge's count, the one it last reported. */
export type RailCountMark = '' | '+' | '?';

export interface RailCount {
  readonly count: number;
  readonly mark:  RailCountMark;
  readonly tone:  RailCountTone;
}

export type RailView = Exclude<GaiaView, 'forge'>;

export interface RailViewRow {
  readonly view:      RailView;
  readonly label:     string;
  readonly href:      string;
  readonly count:     RailCount | null;
  readonly isCurrent: boolean;
}

export interface RailForgeRow {
  readonly trackerId:   string;
  readonly project:     string;
  readonly condition:   DotCondition;
  /** The condition word, and for a forge at another version what that version means: `Older than this Gaia · update the forge`. */
  readonly title:       string;
  readonly href:        string;
  readonly count:       RailCount | null;
  readonly isCurrent:   boolean;
  /** Under the name while the forge has no pipeline: `Not set up yet`, or `Setting up · step 3 of 6` while its board shows where it stands. */
  readonly setupLine:   string | null;
  /**
   * The dashed Set up in place of a count: the forge has no pipeline, no setup of it is under way, nothing else of it waits on User, and Gaia
   * reads it in full and talks to it, so the forge view opens on its onboarding.
   */
  readonly offersSetUp: boolean;
}

/** Where the setup of the forge shown in place stands, as its board last told the page. */
export interface OpenForgeSetup {
  readonly trackerId: string;
  readonly progress:  SetupProgress;
}

export interface RailContent {
  readonly views:       readonly RailViewRow[];
  readonly forges:      readonly RailForgeRow[];
  /** The line under the forges' head when the registry holds no forge; `null` while it holds one and before the first document. */
  readonly noForgeLine: string | null;
  /** `null` until the first fleet document. */
  readonly machine:     MachineLoad | null;
}

/** The board route each forge showed last on this page, by tracker id, so its rail row leads back there. */
export type ForgePlaces = ReadonlyMap<string, BoardRoute>;

export const NO_FORGE_PLACES: ForgePlaces = new Map();

const VIEW_LABELS: Readonly<Record<RailView, string>> = {
  attention: 'Attention',
  agents:    'Agents',
  activity:  'Activity',
  forges:    'Forges',
};

const RAIL_VIEWS: readonly RailView[] = ['attention', 'agents', 'activity', 'forges'];

const NO_FORGE_LINE = 'No forge is registered';

const NOT_SET_UP_LINE = 'Not set up yet';

/** The board shown in place says where its setup stands; any other forge has no pipeline while its "no pipeline" question is open. */
function setupLineOf(forge: FleetDocumentForge, openForgeSetup: OpenForgeSetup | null): string | null {
  const progress = openForgeSetup?.trackerId === forge.trackerId ? openForgeSetup.progress : null;
  if (progress?.stage === 'setting-up') return `Setting up · step ${progress.stepNumber} of ${progress.stepCount}`;
  return progress !== null || FleetDocumentUtil.reportsNoPipeline(forge) ? NOT_SET_UP_LINE : null;
}

/** Only a forge Gaia reads in full and talks to opens on its onboarding; any other opens on why it cannot. */
function setUpOpensTheOnboarding(forge: FleetDocumentForge): boolean {
  return forge.fidelity === 'full' && !FleetDocumentUtil.cannotTalkAtItsVersion(forge);
}

function progressIsTheSame(previousProgress: SetupProgress, reportedProgress: SetupProgress): boolean {
  if (previousProgress.stage === 'not-started' || reportedProgress.stage === 'not-started') return previousProgress.stage === reportedProgress.stage;
  return previousProgress.stepNumber === reportedProgress.stepNumber && previousProgress.stepCount === reportedProgress.stepCount;
}

/** The open forge's setup after its board reported, the same object when nothing changed; `null` progress clears only that forge's. */
function openForgeSetupAfterReport(previous: OpenForgeSetup | null, trackerId: string, progress: SetupProgress | null): OpenForgeSetup | null {
  if (progress === null) return previous?.trackerId === trackerId ? null : previous;
  if (previous?.trackerId === trackerId && progressIsTheSame(previous.progress, progress)) return previous;
  return { trackerId, progress };
}

/** The places after the page showed a route, the same map when nothing changed; a forge's route without a board route keeps its place. */
function forgePlacesAfterRoute(previous: ForgePlaces, route: GaiaRoute): ForgePlaces {
  if (route.view !== 'forge' || route.boardRoute === null) return previous;
  const { trackerId, boardRoute } = route;
  const knownPlace = previous.get(trackerId);
  if (knownPlace?.tab === boardRoute.tab && knownPlace.item === boardRoute.item) return previous;
  return new Map(previous).set(trackerId, boardRoute);
}

function visibleForgesOf(fleetDocument: FleetDocument): FleetDocumentForge[] {
  const hidden = new Set(fleetDocument.settings.hiddenTrackerIds);
  return fleetDocument.forges.filter((forge) => !hidden.has(forge.trackerId));
}

/** A forge opens in place where it was left; one that cannot open in place opens at its Forges row. */
function forgeHrefOf(forge: FleetDocumentForge, forgePlaces: ForgePlaces): string {
  if (ForgeContractUtil.canOpenInPlace(forge)) {
    return HashRouter.fragmentOf({ view: 'forge', trackerId: forge.trackerId, boardRoute: forgePlaces.get(forge.trackerId) ?? null });
  }
  return HashRouter.fragmentOf({ view: 'forges', addingARepository: false, forgeInView: forge.trackerId });
}

function countOf(count: number, tone: RailCountTone, mark: RailCountMark = ''): RailCount {
  return { count, mark, tone };
}

/** A forge read in full counts its entries and its agents a network outage stopped, which wait for User's resume too. */
function forgeCountOf(forge: FleetDocumentForge): RailCount | null {
  switch (forge.fidelity) {
    case 'full': {
      const waiting = FleetDocumentUtil.attentionWaitingOnUserOf(forge).length + forge.outageEndings;
      return waiting === 0 ? null : countOf(waiting, 'attention');
    }
    case 'counts-only':
      return forge.attentionCount === null || forge.attentionCount === 0 ? null : countOf(forge.attentionCount, 'attention');
    case 'unreachable': {
      const lastReported = FleetDocumentUtil.attentionWaitingOnUserOf(forge).length;
      return lastReported === 0 ? null : countOf(lastReported, 'muted', '?');
    }
    default:
      return null;
  }
}

/** What waits on User across the fleet; `4+` when a forge Gaia cannot read in full may hold more, absent when nothing waits. */
function attentionCountOf(fleetDocument: FleetDocument): RailCount | null {
  const { incompleteFor } = fleetDocument.figures;
  const waiting = FleetDocumentUtil.waitingOnUserTotalOf(fleetDocument);
  const morePossible = incompleteFor.length > 0;
  if (waiting === 0 && !morePossible) return null;
  return countOf(waiting, 'attention', morePossible ? '+' : '');
}

/** A count as one piece of text, its mark after it: `4+`, `2?`. */
function countTextOf({ count, mark }: RailCount): string {
  return `${count}${mark}`;
}

function viewCountOf(view: RailView, fleetDocument: FleetDocument | null): RailCount | null {
  if (fleetDocument === null) return null;
  switch (view) {
    case 'attention':
      return attentionCountOf(fleetDocument);
    case 'agents': {
      const notCounted = FleetDocumentUtil.forgesWhoseAgentsAreNotCountedIn(fleetDocument).length > 0;
      return countOf(fleetDocument.agents.length, 'muted', notCounted ? '+' : '');
    }
    case 'forges':
      return countOf(visibleForgesOf(fleetDocument).length, 'muted');
    case 'activity':
      return null;
  }
}

const TITLE_SEPARATOR = ' · ';

function forgeTitleOf(forge: FleetDocumentForge): string {
  const conditionWord = ForgeTextUtil.conditionWordInSentenceCaseOf(ForgeTextUtil.shownConditionOf(forge));
  const title = forge.versions === null ? conditionWord : ForgeVersionsTextUtil.railTitleOf({ project: forge.project, versions: forge.versions }, conditionWord);
  if (forge.outageEndings === 0) return title;
  return `${title}${TITLE_SEPARATOR}${ForgeTextUtil.outageEndingsTextOf(forge.outageEndings)}`;
}

function railViewOf(route: GaiaRoute): RailView | null {
  return route.view === 'forge' ? null : route.view;
}

function forgeRowOf(forge: FleetDocumentForge, currentTrackerId: string | null, openForgeSetup: OpenForgeSetup | null, forgePlaces: ForgePlaces): RailForgeRow {
  const count = forgeCountOf(forge);
  const setupLine = setupLineOf(forge, openForgeSetup);
  return {
    trackerId:   forge.trackerId,
    project:     forge.project,
    condition:   ForgeTextUtil.dotConditionOf(ForgeTextUtil.shownConditionOf(forge)),
    title:       forgeTitleOf(forge),
    href:        forgeHrefOf(forge, forgePlaces),
    count,
    isCurrent:   forge.trackerId === currentTrackerId,
    setupLine,
    offersSetUp: setupLine === NOT_SET_UP_LINE && count === null && setUpOpensTheOnboarding(forge),
  };
}

function railContentOf(
  fleetDocument: FleetDocument | null,
  route: GaiaRoute,
  openForgeSetup: OpenForgeSetup | null = null,
  forgePlaces: ForgePlaces = NO_FORGE_PLACES,
): RailContent {
  const currentView = railViewOf(route);
  const currentTrackerId = route.view === 'forge' ? route.trackerId : null;
  return {
    views: RAIL_VIEWS.map((view) => ({
      view,
      label:     VIEW_LABELS[view],
      href:      `#${view}`,
      count:     viewCountOf(view, fleetDocument),
      isCurrent: view === currentView,
    })),
    forges:      fleetDocument === null ? [] : visibleForgesOf(fleetDocument).map((forge) => forgeRowOf(forge, currentTrackerId, openForgeSetup, forgePlaces)),
    noForgeLine: fleetDocument !== null && fleetDocument.forges.length === 0 ? NO_FORGE_LINE : null,
    machine:     fleetDocument === null ? null : MachineLoadModel.machineLoadOf(fleetDocument),
  };
}

export const RailModel = {
  railContentOf,
  attentionCountOf,
  openForgeSetupAfterReport,
  forgePlacesAfterRoute,
  countTextOf,
  VIEW_LABELS,
} as const;
