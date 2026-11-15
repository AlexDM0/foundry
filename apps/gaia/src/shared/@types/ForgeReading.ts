/** One forge as Gaia last read it, at the fidelity its contracts allow. Internal only, so it carries no version of its own. */
import type { SystemVersion } from 'system-versions/VersionsDocument';

import type { ActivityEntry }     from './ActivityEntry.ts';
import type { AgentRow }          from './AgentRow.ts';
import type { AttentionItem }     from './AttentionItem.ts';
import type { ForgeBrainReading } from './ForgeBrain.ts';

/** `older-contract`: the forge's system version is older than Gaia still talks to, so Gaia reads nothing of it until it is updated. */
export type ForgeFidelity = 'full' | 'counts-only' | 'newer-contract' | 'older-contract' | 'unreachable' | 'dormant' | 'repository-missing';

export type ForgeCondition = 'live' | 'paused' | 'held' | 'passing-baton' | 'starting' | 'dormant' | 'unreachable' | 'unreadable' | 'missing';

/** The contract numbers the forge's identity names; `null` for a contract it does not serve or that Gaia has not read. */
export interface ForgeContracts {
  summary: number | null;
  monitor: number | null;
  control: number | null;
  embed:   number | null;
}

/**
 * How the forge's system version stands to the forge versions Gaia knows. `newer`: its minimum is above the version Gaia is built for, so
 * they cannot talk and Gaia needs an update. `older`: it is below the oldest Gaia talks to, so they cannot talk and the forge needs an
 * update. `ahead`: above the version Gaia is built for, read in full with what Gaia knows. `behind`: below it, read in full without
 * Gaia's newest features. `current`: the version Gaia is built for. `not-reported`: the forge publishes no versions, read as before them.
 */
export type ForgeVersionsVerdict = 'newer' | 'older' | 'ahead' | 'behind' | 'current' | 'not-reported';

/** The forge's own versions, both `null` when it reported none. */
export interface ForgeVersions {
  verdict:          ForgeVersionsVerdict;
  current:          SystemVersion | null;
  minimumSupported: SystemVersion | null;
}

export interface ForgeConcurrency {
  limit:                        number;
  agentsInFlight:               number;
  /** The machine-wide facts are `null` from a forge that enforces no machine limit. */
  machineLimit:                 number | null;
  machineAgentsInFlight:        number | null;
  ticketsWaitingForMachineSlot: number | null;
}

/** An open notice or a warning of the Overseer: the forge's kind and its own sentence. */
export interface ForgeNotice {
  kind: string;
  text: string;
}

/** The usage limit hit, both `null` when none was; and the newest usage window the forge's sessions reported, both `null` when none did. */
export interface ForgeUsage {
  resetsAt:              string | null;
  window:                string | null;
  currentWindow:         string | null;
  currentWindowResetsAt: string | null;
}

export interface ForgeToday {
  deliveredTickets: number;
  tokens:           number;
}

export interface ForgeReading {
  trackerId:         string;
  project:           string;
  root:              string;
  fidelity:          ForgeFidelity;
  condition:         ForgeCondition;
  url:               string | null;
  processId:         number | null;
  contracts:         ForgeContracts;
  codeVersion:       string | null;
  /** The stamp of the newest whole answer, shown as "as last reported"; never compared. */
  lastReportedAt:    string | null;
  overseerStartedAt: string | null;
  /** The registry's record of the last forge command in this repository and its stamp. */
  lastCommand:       string | null;
  lastChangedAt:     string | null;
  concurrency:       ForgeConcurrency | null;
  readyTicketCount:  number | null;
  openIncidents:     number | null;
  attention:         AttentionItem[];
  /** Set only at fidelity counts-only, where the entries are not known by name. */
  attentionCount:    number | null;
  agents:            AgentRow[];
  notices:           ForgeNotice[];
  warnings:          ForgeNotice[];
  activity:          ActivityEntry[];
  today:             ForgeToday | null;
  usage:             ForgeUsage | null;
  brain:             ForgeBrainReading;
  versions:          ForgeVersions;
}
