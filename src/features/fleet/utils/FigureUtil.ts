/**
 * The fleet's figures and machine facts (PLAN 7.4): each a sum over the forges that report it, never a guess. A forge that runs but cannot
 * vouch for its figures is named in `incompleteFor`.
 */
import type { FleetFigures, MachineFacts }  from '../../../shared/@types/FleetSnapshot.ts';
import type { ForgeFidelity, ForgeReading } from '../../../shared/@types/ForgeReading.ts';

/** A dormant forge runs no agent that Gaia can see; an unreachable one keeps the jobs it last reported. */
const FIDELITIES_THAT_REPORT_AGENTS: ReadonlySet<ForgeFidelity> = new Set<ForgeFidelity>(['full', 'counts-only', 'unreachable']);

/** Forges that may run right now and that Gaia does not read in full now: what they add to a figure may be stale or missing. */
const FIDELITIES_THAT_CANNOT_VOUCH: ReadonlySet<ForgeFidelity> = new Set<ForgeFidelity>(['counts-only', 'unreachable', 'newer-contract']);

function agentsAreReportedBy(reading: ForgeReading): boolean {
  return FIDELITIES_THAT_REPORT_AGENTS.has(reading.fidelity);
}

function sumOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function reportedValues(readings: readonly ForgeReading[], valueOf: (reading: ForgeReading) => number | null | undefined): number[] {
  return readings.flatMap((reading) => {
    const value = valueOf(reading);
    return value === null || value === undefined ? [] : [value];
  });
}

/** A summary reports no concurrency, so a counts-only forge's agents in flight are the jobs its summary lists. */
function agentsInFlightOf(reading: ForgeReading): number {
  return reading.concurrency?.agentsInFlight ?? reading.agents.length;
}

/** The limit is one machine-wide value; a forge read in full now is preferred over a reading kept from before a stop. */
function machineLimitOf(readings: readonly ForgeReading[]): number | null {
  const readInFull = reportedValues(readings.filter((reading) => reading.fidelity === 'full'), (reading) => reading.concurrency?.machineLimit);
  return readInFull[0] ?? reportedValues(readings, (reading) => reading.concurrency?.machineLimit)[0] ?? null;
}

function figuresOf(readings: readonly ForgeReading[], waitingOnUser: number): FleetFigures {
  return {
    waitingOnUser,
    agentsInFlight: sumOf(readings.filter(agentsAreReportedBy).map(agentsInFlightOf)),
    machineLimit:   machineLimitOf(readings),
    readyTickets:   sumOf(reportedValues(readings, (reading) => reading.readyTicketCount)),
    deliveredToday: sumOf(reportedValues(readings, (reading) => reading.today?.deliveredTickets)),
    tokensToday:    sumOf(reportedValues(readings, (reading) => reading.today?.tokens)),
    openIncidents:  sumOf(reportedValues(readings, (reading) => reading.openIncidents)),
    incompleteFor:  readings.filter((reading) => FIDELITIES_THAT_CANNOT_VOUCH.has(reading.fidelity)).map((reading) => reading.trackerId),
  };
}

function machineFactsOf(readings: readonly ForgeReading[], cpuCount: number): MachineFacts {
  const ticketsWaiting = reportedValues(readings, (reading) => reading.concurrency?.ticketsWaitingForMachineSlot);
  return {
    cpuCount,
    agentsAskedForByForgeLimits:  sumOf(reportedValues(readings, (reading) => reading.concurrency?.limit)),
    ticketsWaitingForMachineSlot: ticketsWaiting.length === 0 ? null : sumOf(ticketsWaiting),
  };
}

export const FigureUtil = {
  agentsAreReportedBy,
  figuresOf,
  machineFactsOf,
} as const;
