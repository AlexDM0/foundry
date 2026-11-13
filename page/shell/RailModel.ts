/**
 * What the rail shows of a fleet document: the four views with their counts, one row per forge not hidden in registry order, or a line
 * saying the registry holds none, and this machine's agents against its limit. Every count is the document's own figure; one the document
 * does not hold is absent, never zero.
 */
import type { FleetDocument, FleetDocumentForge }    from '../@types/FleetDocument.ts';
import type { DotCondition }                         from '../design-system/ConditionDot.tsx';
import { ForgeContractUtil }                         from '../shared/utils/ForgeContractUtil.ts';
import { ForgeTextUtil }                             from '../shared/utils/ForgeTextUtil.ts';
import { type GaiaRoute, type GaiaView, HashRouter } from './HashRouter.ts';

export type RailCountTone = 'attention' | 'muted';

export interface RailCount {
  readonly text: string;
  readonly tone: RailCountTone;
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
  readonly href:      string;
  readonly count:     RailCount | null;
  readonly isCurrent: boolean;
}

export interface RailMachine {
  readonly agentsText:   string;
  readonly meter:        { readonly used: number; readonly whole: number; readonly label: string } | null;
  readonly limitLine:    string;
  readonly isAtTheLimit: boolean;
}

export interface RailContent {
  readonly views:       readonly RailViewRow[];
  readonly forges:      readonly RailForgeRow[];
  /** The line under the forges' head when the registry holds no forge (B4); `null` while it holds one and before the first document. */
  readonly noForgeLine: string | null;
  /** `null` until the first fleet document. */
  readonly machine:     RailMachine | null;
}

const VIEW_LABELS: Readonly<Record<RailView, string>> = {
  attention: 'Attention',
  agents:    'Agents',
  activity:  'Activity',
  forges:    'Forges',
};

const RAIL_VIEWS: readonly RailView[] = ['attention', 'agents', 'activity', 'forges'];

const NO_FORGE_LINE = 'No forge is registered.';

/** An unreachable forge's count is the one it last reported. */
const AS_LAST_REPORTED_MARK = '?';

/** A forge Gaia cannot read in full may hold more than the fleet's figure counts. */
const MORE_POSSIBLE_MARK = '+';

function countedPhrase(count: number, singularPhrase: string, pluralPhrase: string): string {
  return `${count} ${count === 1 ? singularPhrase : pluralPhrase}`;
}

function visibleForgesOf(fleetDocument: FleetDocument): FleetDocumentForge[] {
  const hidden = new Set(fleetDocument.settings.hiddenTrackerIds);
  return fleetDocument.forges.filter((forge) => !hidden.has(forge.trackerId));
}

/** A forge that cannot open in place opens at its Forges row. */
function forgeHrefOf(forge: FleetDocumentForge): string {
  if (ForgeContractUtil.canOpenInPlace(forge)) return HashRouter.fragmentOf({ view: 'forge', trackerId: forge.trackerId, bridgeFragment: null });
  return HashRouter.fragmentOf({ view: 'forges', addingARepository: false, forgeInView: forge.trackerId });
}

function forgeCountOf(forge: FleetDocumentForge): RailCount | null {
  switch (forge.fidelity) {
    case 'full':
      return forge.attention.length === 0 ? null : { text: String(forge.attention.length), tone: 'attention' };
    case 'counts-only':
      return forge.attentionCount === null || forge.attentionCount === 0 ? null : { text: String(forge.attentionCount), tone: 'attention' };
    case 'unreachable':
      return forge.attention.length === 0 ? null : { text: `${forge.attention.length}${AS_LAST_REPORTED_MARK}`, tone: 'muted' };
    default:
      return null;
  }
}

/** What waits on User across the fleet; `4+` when a forge Gaia cannot read in full may hold more, absent when nothing waits. */
function attentionCountOf(fleetDocument: FleetDocument): RailCount | null {
  const { waitingOnUser, incompleteFor } = fleetDocument.figures;
  const morePossible = incompleteFor.length > 0;
  if (waitingOnUser === 0 && !morePossible) return null;
  return { text: `${waitingOnUser}${morePossible ? MORE_POSSIBLE_MARK : ''}`, tone: 'attention' };
}

function viewCountOf(view: RailView, fleetDocument: FleetDocument | null): RailCount | null {
  if (fleetDocument === null) return null;
  switch (view) {
    case 'attention':
      return attentionCountOf(fleetDocument);
    case 'agents':
      return { text: String(fleetDocument.agents.length), tone: 'muted' };
    case 'forges':
      return { text: String(visibleForgesOf(fleetDocument).length), tone: 'muted' };
    case 'activity':
      return null;
  }
}

function limitLineOf(fleetDocument: FleetDocument, isAtTheLimit: boolean): string {
  const { machineLimit } = fleetDocument.figures;
  const { cpuCount, ticketsWaitingForMachineSlot } = fleetDocument.machine;
  if (isAtTheLimit) {
    if (ticketsWaitingForMachineSlot === null || ticketsWaitingForMachineSlot === 0) return 'at the limit';
    return `at the limit · ${countedPhrase(ticketsWaitingForMachineSlot, 'ticket waits', 'tickets wait')}`;
  }
  if (machineLimit === null) return `no limit known · ${countedPhrase(cpuCount, 'CPU', 'CPUs')}`;
  return `limit ${machineLimit} of ${countedPhrase(cpuCount, 'CPU', 'CPUs')}`;
}

function machineOf(fleetDocument: FleetDocument): RailMachine {
  const { agentsInFlight, machineLimit } = fleetDocument.figures;
  const isAtTheLimit = machineLimit !== null && agentsInFlight >= machineLimit;
  return {
    agentsText: machineLimit === null ? String(agentsInFlight) : `${agentsInFlight} / ${machineLimit}`,
    meter:      machineLimit === null ? null : { used: agentsInFlight, whole: machineLimit, label: `${agentsInFlight} of ${machineLimit} agents` },
    limitLine:  limitLineOf(fleetDocument, isAtTheLimit),
    isAtTheLimit,
  };
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
      condition: ForgeTextUtil.dotConditionOf(forge.condition),
      href:      forgeHrefOf(forge),
      count:     forgeCountOf(forge),
      isCurrent: forge.trackerId === currentTrackerId,
    })),
    noForgeLine: fleetDocument !== null && fleetDocument.forges.length === 0 ? NO_FORGE_LINE : null,
    machine:     fleetDocument === null ? null : machineOf(fleetDocument),
  };
}

export const RailModel = {
  railContentOf,
  attentionCountOf,
  machineOf,
  VIEW_LABELS,
} as const;
