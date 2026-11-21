/**
 * The readings a forge watch gives a forge it cannot read right now: dormant, its repository missing, starting, or unreachable. Each is
 * built from the registry entry and the last whole reading of this run, so what Gaia read before a stop or a lost connection stays, and
 * the last command the entry names now replaces the one the reading was taken with.
 */
import type { ForgeRegistryFacts }                    from '../../adapters/forge-api/@types/ForgeDocumentReading.ts';
import type { RegisteredForge, RegisteredHephaestus } from '../../adapters/forge-registry/@types/RegisteredForge.ts';
import type { ForgeClientFailure }                    from '../../lib/forge-client/@types/ForgeClientAnswer.ts';
import type { ForgeContracts, ForgeReading }          from '../../shared/@types/ForgeReading.ts';

const NO_CONTRACTS: ForgeContracts = {
  summary: null,
  monitor: null,
  control: null,
};

/** The registry's entry for a forge whose Hephaestus it names, as the forge-api ingestions take it. */
function registryFactsOf(forge: RegisteredForge, hephaestus: RegisteredHephaestus): ForgeRegistryFacts {
  return {
    trackerId:           forge.trackerId,
    project:             forge.project,
    root:                forge.root,
    hephaestusUrl:       hephaestus.url,
    hephaestusProcessId: hephaestus.processId,
    program:             forge.program,
    lastCommand:         forge.lastCommand,
    lastChangedAt:       forge.lastChangedAt,
  };
}

/** A forge of which this run read nothing: what the registry says of it, and no fact a forge would have to report. */
function registryOnlyReadingOf(forge: RegisteredForge, fidelity: ForgeReading['fidelity'], condition: ForgeReading['condition']): ForgeReading {
  return {
    trackerId:           forge.trackerId,
    project:             forge.project,
    root:                forge.root,
    fidelity,
    condition,
    url:                 forge.hephaestus?.url ?? null,
    processId:           forge.hephaestus?.processId ?? null,
    contracts:           NO_CONTRACTS,
    codeVersion:         null,
    lastReportedAt:      null,
    hephaestusStartedAt: forge.hephaestus?.startedAt ?? null,
    program:             forge.program,
    lastCommand:         forge.lastCommand,
    lastChangedAt:       forge.lastChangedAt,
    concurrency:         null,
    readyTicketCount:    null,
    openIncidents:       null,
    attention:           [],
    attentionCount:      null,
    agents:              [],
    notices:             [],
    warnings:            [],
    activity:            [],
    today:               null,
    usage:               null,
    versions:            null,
    registryPresence:    forge.presence,
    presenceReport:      null,
    newestVersions:      null,
  };
}

/**
 * A forge with no Hephaestus keeps what the forge last reported in this run about its board, its log and its limits; what only a running
 * Hephaestus knows (its address, its jobs, what waits on User or for a machine slot, its notices and today's figures) is gone
 * with it.
 */
function dormantReadingOf(forge: RegisteredForge, lastWholeReading: ForgeReading | null): ForgeReading {
  if (lastWholeReading === null) return registryOnlyReadingOf(forge, 'dormant', 'dormant');
  const { concurrency } = lastWholeReading;
  return {
    ...lastWholeReading,
    trackerId:           forge.trackerId,
    project:             forge.project,
    root:                forge.root,
    fidelity:            'dormant',
    condition:           'dormant',
    url:                 null,
    processId:           null,
    hephaestusStartedAt: null,
    program:             forge.program,
    lastCommand:         forge.lastCommand,
    lastChangedAt:       forge.lastChangedAt,
    concurrency:         concurrency === null ? null : { ...concurrency, ticketsWaitingForMachineSlot: null },
    attention:           [],
    attentionCount:      null,
    agents:              [],
    notices:             [],
    warnings:            [],
    today:               null,
    usage:               null,
  };
}

function repositoryMissingReadingOf(forge: RegisteredForge): ForgeReading {
  return registryOnlyReadingOf(forge, 'repository-missing', 'missing');
}

/** The forge answers that its Hephaestus is starting: nothing of it can be read yet, so it reads as dormant, with the word `starting`. */
function startingReadingOf(forge: RegisteredForge, lastWholeReading: ForgeReading | null): ForgeReading {
  return {
    ...dormantReadingOf(forge, lastWholeReading),
    condition:           'starting',
    url:                 forge.hephaestus?.url ?? null,
    processId:           forge.hephaestus?.processId ?? null,
    hephaestusStartedAt: forge.hephaestus?.startedAt ?? null,
  };
}

/** The last whole reading stays, marked unreachable, and its `lastReportedAt` says when the forge last reported it (artboard B3). */
function unreachableReadingOf(forge: RegisteredForge, lastWholeReading: ForgeReading | null): ForgeReading {
  if (lastWholeReading === null) return registryOnlyReadingOf(forge, 'unreachable', 'unreachable');
  return {
    ...lastWholeReading,
    fidelity:      'unreachable',
    condition:     'unreachable',
    program:       forge.program,
    lastCommand:   forge.lastCommand,
    lastChangedAt: forge.lastChangedAt,
  };
}

/**
 * The refusals of a Hephaestus that has not finished starting: its identity and its monitor answer `starting` until it serves, and its
 * monitor stream `not-ready` until it took its generation.
 */
const STARTING_REFUSALS: ReadonlySet<string | null> = new Set(['starting', 'not-ready']);

function failureMeansStarting(failure: ForgeClientFailure): boolean {
  return failure.verdict === 'refused' && STARTING_REFUSALS.has(failure.refusal);
}

export const WatchReadingUtil = {
  failureMeansStarting,
  registryFactsOf,
  dormantReadingOf,
  repositoryMissingReadingOf,
  startingReadingOf,
  unreachableReadingOf,
} as const;
