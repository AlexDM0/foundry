/** Every forge's reading, the machine's facts and Gaia's settings in; one `FleetSnapshot` out. Pure: it reads nothing and keeps nothing. */
import type {
  FleetActivityEntry,
  FleetAgentRow,
  FleetSnapshot,
  GaiaFacts,
} from '../../shared/@types/FleetSnapshot.ts';
import type { ForgeReading } from '../../shared/@types/ForgeReading.ts';
import type { GaiaSettings } from '../../shared/@types/GaiaSettings.ts';
import { LIMITS }            from '../../shared/constants/Limits.ts';

import { AttentionOrderUtil } from './utils/AttentionOrderUtil.ts';
import { FigureUtil }         from './utils/FigureUtil.ts';
import { ForgeLookUtil }      from './utils/ForgeLookUtil.ts';

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

/** By project name, then by job id read as a number, so J2 comes before J11. */
function fleetAgentsOf(readings: readonly ForgeReading[]): FleetAgentRow[] {
  const collator = new Intl.Collator('en', { numeric: true });
  return readings
    .filter(FigureUtil.agentsAreReportedBy)
    .map((reading) => ({ reading, rows: reading.agents.map((row): FleetAgentRow => ({ ...row, trackerId: reading.trackerId })) }))
    .sort((a, b) => collator.compare(a.reading.project, b.reading.project))
    .flatMap(({ rows }) => rows.sort((a, b) => collator.compare(a.jobId, b.jobId)));
}

/** A hidden forge is absent from everything but the settings that hide it. */
function visibleReadingsOf(readings: readonly ForgeReading[], settings: GaiaSettings): ForgeReading[] {
  const hiddenTrackerIds = new Set(settings.hiddenTrackerIds);
  return readings.filter((reading) => !hiddenTrackerIds.has(reading.trackerId));
}

export function fleetSnapshotOf(input: FleetAssemblyInput): FleetSnapshot {
  const forges    = visibleReadingsOf(input.readings, input.settings);
  const attention = AttentionOrderUtil.fleetAttentionOf(forges);
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
