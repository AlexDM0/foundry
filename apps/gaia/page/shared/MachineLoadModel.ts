/**
 * This machine's agents against its limit, as a fleet document reports them: the figure, the meter's slots and the lines at, under and
 * without a limit. Every count is the document's own figure.
 */
import type { FleetDocument } from '../@types/FleetDocument.ts';
import { CountTextUtil }      from './utils/CountTextUtil.ts';
import { FleetDocumentUtil }  from './utils/FleetDocumentUtil.ts';

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

function atTheLimitLineOf(fleetDocument: FleetDocument): string {
  const { ticketsWaitingForMachineSlot } = fleetDocument.machine;
  if (ticketsWaitingForMachineSlot === null || ticketsWaitingForMachineSlot === 0) return 'at the limit';
  return `at the limit${LINE_SEPARATOR}${CountTextUtil.countedPhrase(ticketsWaitingForMachineSlot, 'ticket waits', 'tickets wait')}`;
}

/**
 * The limit against the CPUs, then what the figure holds that Gaia cannot vouch for now: the agents of an unreachable forge as it last
 * reported them (B3), and the forges at a version Gaia cannot talk to, whose agents it leaves out.
 */
function limitLineOf(fleetDocument: FleetDocument): string {
  const { machineLimit, agentsInFlight } = fleetDocument.figures;
  const cpus = CountTextUtil.countedPhrase(fleetDocument.machine.cpuCount, 'CPU', 'CPUs');
  const limitClause = machineLimit === null ? `no limit known${LINE_SEPARATOR}${cpus}` : `limit ${machineLimit} of ${cpus}`;
  const unreachable = new Set(fleetDocument.forges.filter((forge) => forge.fidelity === 'unreachable').map((forge) => forge.trackerId));
  const notCounted = FleetDocumentUtil.forgesWhoseAgentsAreNotCountedIn(fleetDocument).length;
  const asLastReported = fleetDocument.agents.filter((row) => unreachable.has(row.trackerId)).length;
  const vouchClauses = [
    unreachable.size === 0 ? null : `${asLastReported} of the ${agentsInFlight} as last reported`,
    notCounted === 0 ? null : CountTextUtil.countedPhrase(notCounted, 'forge not counted', 'forges not counted'),
  ].filter((clause) => clause !== null);
  return [limitClause, ...vouchClauses].join(LINE_SEPARATOR);
}

/** `8 / 12`, or `8+ / 12` while a forge Gaia cannot talk to runs agents the figure leaves out. */
function agentsTextOf(fleetDocument: FleetDocument): string {
  const { agentsInFlight, machineLimit } = fleetDocument.figures;
  const agents = `${agentsInFlight}${FleetDocumentUtil.forgesWhoseAgentsAreNotCountedIn(fleetDocument).length > 0 ? '+' : ''}`;
  return machineLimit === null ? agents : `${agents} / ${machineLimit}`;
}

function machineLoadOf(fleetDocument: FleetDocument): MachineLoad {
  const { agentsInFlight, machineLimit } = fleetDocument.figures;
  const isAtTheLimit = machineLimit !== null && agentsInFlight >= machineLimit;
  const slots = machineLimit ?? fleetDocument.machine.cpuCount;
  return {
    agentsText: agentsTextOf(fleetDocument),
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
