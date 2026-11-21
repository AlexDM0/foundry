/**
 * What the rail shows of a fleet document: the four views with their counts, one row per forge not hidden in registry order, or a line
 * saying the registry holds none, and this machine's agents against its limit. Every count is the document's own figure; one the document
 * does not hold is absent, never zero. Agents is
 * `8+` while a forge at a version Gaia cannot talk to runs agents no total counts.
 */
import type { FleetDocument, FleetDocumentForge }    from '../@types/FleetDocument.ts';
import type { DotCondition }                         from '../design-system/ConditionDot.tsx';
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
  readonly trackerId: string;
  readonly project:   string;
  readonly condition: DotCondition;
  /** The condition word, and for a forge at another version what that version means: `Older than this Gaia · update the forge`. */
  readonly title:     string;
  readonly href:      string;
  readonly count:     RailCount | null;
  readonly isCurrent: boolean;
}

export interface RailContent {
  readonly views:       readonly RailViewRow[];
  readonly forges:      readonly RailForgeRow[];
  /** The line under the forges' head when the registry holds no forge (B4); `null` while it holds one and before the first document. */
  readonly noForgeLine: string | null;
  /** `null` until the first fleet document. */
  readonly machine:     MachineLoad | null;
}

const VIEW_LABELS: Readonly<Record<RailView, string>> = {
  attention: 'Attention',
  agents:    'Agents',
  activity:  'Activity',
  forges:    'Forges',
};

const RAIL_VIEWS: readonly RailView[] = ['attention', 'agents', 'activity', 'forges'];

const NO_FORGE_LINE = 'No forge is registered';

function visibleForgesOf(fleetDocument: FleetDocument): FleetDocumentForge[] {
  const hidden = new Set(fleetDocument.settings.hiddenTrackerIds);
  return fleetDocument.forges.filter((forge) => !hidden.has(forge.trackerId));
}

/** A forge that cannot open in place opens at its Forges row. */
function forgeHrefOf(forge: FleetDocumentForge): string {
  if (ForgeContractUtil.canOpenInPlace(forge)) return HashRouter.fragmentOf({ view: 'forge', trackerId: forge.trackerId, boardRoute: null });
  return HashRouter.fragmentOf({ view: 'forges', addingARepository: false, forgeInView: forge.trackerId });
}

function countOf(count: number, tone: RailCountTone, mark: RailCountMark = ''): RailCount {
  return { count, mark, tone };
}

/** A forge read in full counts its entries and its agents a network outage stopped, which wait for User's resume too. */
function forgeCountOf(forge: FleetDocumentForge): RailCount | null {
  switch (forge.fidelity) {
    case 'full': {
      const waiting = forge.attention.length + forge.outageEndings;
      return waiting === 0 ? null : countOf(waiting, 'attention');
    }
    case 'counts-only':
      return forge.attentionCount === null || forge.attentionCount === 0 ? null : countOf(forge.attentionCount, 'attention');
    case 'unreachable':
      return forge.attention.length === 0 ? null : countOf(forge.attention.length, 'muted', '?');
    default:
      return null;
  }
}

/** What waits on User across the fleet; `4+` when a forge Gaia cannot read in full may hold more, absent when nothing waits. */
function attentionCountOf(fleetDocument: FleetDocument): RailCount | null {
  const { waitingOnUser, incompleteFor } = fleetDocument.figures;
  const morePossible = incompleteFor.length > 0;
  if (waitingOnUser === 0 && !morePossible) return null;
  return countOf(waitingOnUser, 'attention', morePossible ? '+' : '');
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

function railContentOf(fleetDocument: FleetDocument | null, route: GaiaRoute): RailContent {
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
    forges: fleetDocument === null ? [] : visibleForgesOf(fleetDocument).map((forge) => ({
      trackerId: forge.trackerId,
      project:   forge.project,
      condition: ForgeTextUtil.dotConditionOf(ForgeTextUtil.shownConditionOf(forge)),
      title:     forgeTitleOf(forge),
      href:      forgeHrefOf(forge),
      count:     forgeCountOf(forge),
      isCurrent: forge.trackerId === currentTrackerId,
    })),
    noForgeLine: fleetDocument !== null && fleetDocument.forges.length === 0 ? NO_FORGE_LINE : null,
    machine:     fleetDocument === null ? null : MachineLoadModel.machineLoadOf(fleetDocument),
  };
}

export const RailModel = {
  railContentOf,
  attentionCountOf,
  countTextOf,
  VIEW_LABELS,
} as const;
