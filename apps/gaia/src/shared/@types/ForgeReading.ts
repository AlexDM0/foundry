/** One forge as Gaia last read it, at the fidelity its contracts allow. Internal only, so it carries no version of its own. */
import type { SystemVersion } from 'system-versions/VersionsDocument';

import type { ActivityEntry }                              from './ActivityEntry.ts';
import type { AgentRow }                                   from './AgentRow.ts';
import type { AttentionItem }                              from './AttentionItem.ts';
import type { ForgePresenceReport, ForgeRegistryPresence } from './ForgePresence.ts';

/** `older-contract`: the forge's system version is older than the one Gaia supports, so Gaia reads nothing of it until it is updated. */
export type ForgeFidelity = 'full' | 'counts-only' | 'newer-contract' | 'older-contract' | 'unreachable' | 'dormant' | 'repository-missing';

export type ForgeCondition = 'live' | 'paused' | 'held' | 'restarting' | 'starting' | 'dormant' | 'unreachable' | 'unreadable' | 'missing';

/** The contract numbers the forge's identity names; `null` for a contract it does not serve or that Gaia has not read. */
export interface ForgeContracts {
  summary: number | null;
  monitor: number | null;
  control: number | null;
}

/**
 * How the forge's system version stands to the one forge version Gaia supports. `newer`: its minimum is above the supported version, so
 * they cannot talk and Gaia needs an update. `older`: it is below the supported version, or serves no `/api/versions` at all, so they
 * cannot talk and the forge needs an update. `ahead`: above the supported version and still serving it, read with what Gaia knows.
 * `current`: the supported version.
 */
export type ForgeVersionsVerdict = 'newer' | 'older' | 'ahead' | 'current';

/** The forge's own versions, both `null` for a forge that serves no `/api/versions`. */
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

/** An open notice or a warning of Hephaestus: the forge's kind and its own sentence. */
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

/** The installed forge program's versions, read with `forge version --json`: its code version and the Talos protocol version it starts. */
export interface ForgeNewestVersions {
  codeVersion:          string;
  talosProtocolVersion: number;
}

export interface ForgeToday {
  deliveredTickets: number;
  tokens:           number;
}

export interface ForgeReading {
  trackerId:           string;
  project:             string;
  root:                string;
  fidelity:            ForgeFidelity;
  condition:           ForgeCondition;
  url:                 string | null;
  processId:           number | null;
  contracts:           ForgeContracts;
  codeVersion:         string | null;
  /** The stamp of the newest whole answer, shown as "as last reported"; never compared. */
  lastReportedAt:      string | null;
  hephaestusStartedAt: string | null;
  /** The forge program the registry names for this forge, which Gaia starts it with before the one in its settings; `null` when it names none. */
  program:             string | null;
  /** The registry's record of the last forge command in this repository and its stamp. */
  lastCommand:         string | null;
  lastChangedAt:       string | null;
  concurrency:         ForgeConcurrency | null;
  readyTicketCount:    number | null;
  openIncidents:       number | null;
  attention:           AttentionItem[];
  /** Set only at fidelity counts-only, where the entries are not known by name. */
  attentionCount:      number | null;
  agents:              AgentRow[];
  notices:             ForgeNotice[];
  warnings:            ForgeNotice[];
  activity:            ActivityEntry[];
  today:               ForgeToday | null;
  usage:               ForgeUsage | null;
  /** `null` for a reading taken without the forge's `/api/versions`, such as a dormant or an unreachable forge's. */
  versions:            ForgeVersions | null;
  /** What the registry says the forge last wrote of its presence, as the entry names it now. */
  registryPresence:    ForgeRegistryPresence | null;
  /** The presence a live forge serves, read at each change of its monitor snapshot; `null` for a forge not read in full. */
  presenceReport:      ForgePresenceReport | null;
  /** The installed program's versions, read once per registry check that finds the forge's entry changed; `null` until read or unreadable. */
  newestVersions:      ForgeNewestVersions | null;
}
