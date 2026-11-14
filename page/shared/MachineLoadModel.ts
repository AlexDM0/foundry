/**
 * This machine's agents against its limit, as a fleet document reports them: the figure, the meter's slots and the lines at, under and
 * without a limit. Every count is the document's own figure; a brain's row counts against no limit, and the limit's line says so.
 */
import type { FleetDocument } from '../@types/FleetDocument.ts';
import { CountTextUtil }      from './utils/CountTextUtil.ts';

export interface MachineLoadMeter {
  readonly filled: number;
  /** The machine limit, or the CPU count while no forge reports a limit: the limit is never above it. */
  readonly slots:  number;
  readonly label:  string;
}

export interface MachineLoad {
  readonly agentsText:     string;
  readonly meter:          MachineLoadMeter;
  /** What waits at the limit (B2), above the limit's line; `null` under the limit. */
  readonly atTheLimitLine: string | null;
  readonly limitLine:      string;
  readonly isAtTheLimit:   boolean;
}

const LINE_SEPARATOR = ' · ';

const BRAIN_OUTSIDE_THE_LIMIT_CLAUSE = 'Flint\'s brain runs outside it';

function atTheLimitLineOf(fleetDocument: FleetDocument): string {
  const { ticketsWaitingForMachineSlot } = fleetDocument.machine;
  if (ticketsWaitingForMachineSlot === null || ticketsWaitingForMachineSlot === 0) return 'at the limit';
  return `at the limit${LINE_SEPARATOR}${CountTextUtil.countedPhrase(ticketsWaitingForMachineSlot, 'ticket waits', 'tickets wait')}`;
}

/**
 * The limit against the CPUs, then what the figure holds that Gaia cannot vouch for now: the agents of an unreachable forge as it last
 * reported them (B3); otherwise, under a known limit, that Flint's brain runs outside it, once a forge reports a brain at all.
 */
function limitLineOf(fleetDocument: FleetDocument): string {
  const { machineLimit, agentsInFlight } = fleetDocument.figures;
  const cpus = CountTextUtil.countedPhrase(fleetDocument.machine.cpuCount, 'CPU', 'CPUs');
  const limitClause = machineLimit === null ? `no limit known${LINE_SEPARATOR}${cpus}` : `limit ${machineLimit} of ${cpus}`;
  const unreachable = new Set(fleetDocument.forges.filter((forge) => forge.fidelity === 'unreachable').map((forge) => forge.trackerId));
  if (unreachable.size > 0) {
    const asLastReported = fleetDocument.agents.filter((row) => row.countsAgainstLimit && unreachable.has(row.trackerId)).length;
    return `${limitClause}${LINE_SEPARATOR}${asLastReported} of the ${agentsInFlight} as last reported`;
  }
  const aBrainIsReported = fleetDocument.forges.some((forge) => forge.brain !== 'not-reported');
  return machineLimit !== null && aBrainIsReported ? `${limitClause}${LINE_SEPARATOR}${BRAIN_OUTSIDE_THE_LIMIT_CLAUSE}` : limitClause;
}

function machineLoadOf(fleetDocument: FleetDocument): MachineLoad {
  const { agentsInFlight, machineLimit } = fleetDocument.figures;
  const isAtTheLimit = machineLimit !== null && agentsInFlight >= machineLimit;
  const slots = machineLimit ?? fleetDocument.machine.cpuCount;
  return {
    agentsText: machineLimit === null ? String(agentsInFlight) : `${agentsInFlight} / ${machineLimit}`,
    meter:      {
      filled: agentsInFlight,
      slots,
      label:  machineLimit === null ? `${agentsInFlight} agents, no limit known` : `${agentsInFlight} of ${machineLimit} agents`,
    },
    atTheLimitLine: isAtTheLimit ? atTheLimitLineOf(fleetDocument) : null,
    limitLine:      limitLineOf(fleetDocument),
    isAtTheLimit,
  };
}

export const MachineLoadModel = { machineLoadOf, } as const;
