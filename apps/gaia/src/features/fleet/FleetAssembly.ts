/** Every forge's reading, the machine's facts and Gaia's settings in; one `FleetSnapshot` out. Pure: it reads nothing and keeps nothing. */
import type {
  FleetActivityEntry,
  FleetAgentRow,
  FleetAttentionItem,
  FleetForge,
  FleetSnapshot,
  GaiaFacts,
} from '../../shared/@types/FleetSnapshot.ts';
import type { ForgeBrain }   from '../../shared/@types/ForgeBrain.ts';
import type { ForgeReading } from '../../shared/@types/ForgeReading.ts';
import type { GaiaSettings } from '../../shared/@types/GaiaSettings.ts';
import { LIMITS }            from '../../shared/constants/Limits.ts';

import { AttentionOrderUtil } from './utils/AttentionOrderUtil.ts';
import { FigureUtil }         from './utils/FigureUtil.ts';
import { ForgeLookUtil }      from './utils/ForgeLookUtil.ts';
import { ForgePresenceUtil }  from './utils/ForgePresenceUtil.ts';

export interface FleetAssemblyInput {
  /** In registry order, which is the order every forge list keeps. */
  readonly readings: readonly ForgeReading[];
  readonly machine:  { readonly cpuCount: number };
  readonly settings: GaiaSettings;
  readonly gaia:     GaiaFacts;
}

/** A stamp that does not parse sorts after every stamp that does. */
function instantOf(stamp: string): number {
  const instant = Date.parse(stamp);
  return Number.isNaN(instant) ? Number.NEGATIVE_INFINITY : instant;
}

/**
 * Entries of different writers are ordered by their stamps for display only: the stated exception to "a clock decides nothing" (PLAN 7.3);
 * nothing else depends on the order.
 */
function newestFirst(a: FleetActivityEntry, b: FleetActivityEntry): number {
  const aInstant = instantOf(a.at);
  const bInstant = instantOf(b.at);
  if (aInstant === bInstant) return 0;
  return aInstant > bInstant ? -1 : 1;
}

/** A dormant forge's entries stay as long as Gaia runs (artboard A3), so every reading's entries are merged. */
function fleetActivityOf(readings: readonly ForgeReading[]): FleetActivityEntry[] {
  return readings
    .flatMap((reading) => reading.activity
      .map((entry): FleetActivityEntry => ({ ...entry, trackerId: reading.trackerId }))
      .sort(newestFirst)
      .slice(0, LIMITS.activityEntriesShownPerForge))
    .sort(newestFirst);
}

/** The id of a brain's row among its forge's job ids, and the last part of its route `#agents/<trackerId>/flint-brain`. */
export const FLINT_BRAIN_ROW_ID = 'flint-brain';

/** The role of a brain's row, beside a job's `builder` or `reviewer`. */
export const FLINT_BRAIN_ROLE = 'brain';

/** A running brain is not a job: its row reports what the forge says of the brain, and every job fact it has none of is `null`. */
function brainRowOf(trackerId: string, brain: ForgeBrain): FleetAgentRow {
  return {
    trackerId,
    countsAgainstLimit:  false,
    jobId:               FLINT_BRAIN_ROW_ID,
    kind:                FLINT_BRAIN_ROW_ID,
    role:                FLINT_BRAIN_ROLE,
    state:               brain.state,
    ticketIds:           [],
    tokens:              brain.tokens ?? 0,
    ticketTitle:         null,
    attempt:             null,
    startedAt:           brain.startedAt,
    calls:               brain.calls,
    callBudget:          null,
    toolCalls:           null,
    lastToolCall:        null,
    runningSubagents:    null,
    silentSweeps:        null,
    quiet:               null,
    turn:                null,
    messagesWaiting:     null,
    lastLine:            null,
    waitingOnDecisionId: null,
    interruption:        null,
    boardRoute:          null,
  };
}

function brainRowsOf(reading: ForgeReading): FleetAgentRow[] {
  const { brain } = reading;
  return brain !== 'not-reported' && brain.state === 'running' ? [brainRowOf(reading.trackerId, brain)] : [];
}

/** By project name, then by job id read as a number, so J2 comes before J11; a running brain's row closes its forge's rows. */
function fleetAgentsOf(readings: readonly ForgeReading[]): FleetAgentRow[] {
  const collator = new Intl.Collator('en', { numeric: true });
  return readings
    .filter(FigureUtil.agentsAreReportedBy)
    .map((reading) => ({ reading, rows: reading.agents.map((row): FleetAgentRow => ({ ...row, trackerId: reading.trackerId, countsAgainstLimit: true })) }))
    .sort((a, b) => collator.compare(a.reading.project, b.reading.project))
    .flatMap(({ reading, rows }) => [...rows.sort((a, b) => collator.compare(a.jobId, b.jobId)), ...brainRowsOf(reading)]);
}

/** A hidden forge is absent from everything but the settings that hide it. */
function visibleReadingsOf(readings: readonly ForgeReading[], settings: GaiaSettings): ForgeReading[] {
  const hiddenTrackerIds = new Set(settings.hiddenTrackerIds);
  return readings.filter((reading) => !hiddenTrackerIds.has(reading.trackerId));
}

/** A forge that crashed, is down or hung leads what waits on User: nothing else of it moves until User acts on it. */
function fleetAttentionWithForgeAlertsOf(forges: readonly FleetForge[]): FleetAttentionItem[] {
  const forgeAlerts = forges.flatMap((forge) => {
    const alert = ForgePresenceUtil.forgeAlertOf(forge);
    return alert === null ? [] : [alert];
  });
  return [...forgeAlerts, ...AttentionOrderUtil.fleetAttentionOf(forges)];
}

export function fleetSnapshotOf(input: FleetAssemblyInput): FleetSnapshot {
  const forges    = visibleReadingsOf(input.readings, input.settings).map(ForgePresenceUtil.fleetForgeOf);
  const attention = fleetAttentionWithForgeAlertsOf(forges);
  return {
    forges,
    attention,
    needsALook: ForgeLookUtil.looksOf(forges),
    agents:     fleetAgentsOf(forges),
    activity:   fleetActivityOf(forges),
    machine:    FigureUtil.machineFactsOf(forges, input.machine.cpuCount),
    figures:    FigureUtil.figuresOf(forges, attention.length),
    settings:   input.settings,
    gaia:       input.gaia,
  };
}
