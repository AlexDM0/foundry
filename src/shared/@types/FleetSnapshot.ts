/** Every forge's reading assembled into one picture of the machine; the page receives it mapped out as a `FleetDocument`. */
import type { ActivityEntry } from './ActivityEntry.ts';
import type { AgentRow }      from './AgentRow.ts';
import type { AttentionItem } from './AttentionItem.ts';
import type { ForgeReading }  from './ForgeReading.ts';
import type { GaiaSettings }  from './GaiaSettings.ts';

export interface FleetAttentionItem extends AttentionItem {
  trackerId: string;
}

/** A job counts against its forge's limit and the machine's; a brain's row does not (PLAN 7.5). */
export interface FleetAgentRow extends AgentRow {
  trackerId:          string;
  countsAgainstLimit: boolean;
}

export interface FleetActivityEntry extends ActivityEntry {
  trackerId: string;
}

/** The forge-level conditions no Bridge can raise about itself, in the order that picks the one a forge shows. */
export type ForgeLookKind =
  | 'unreachable'
  | 'newer-contract'
  | 'baton-pass-failed'
  | 'launches-held'
  | 'new-code'
  | 'counts-only'
  | 'dormant-with-ready-tickets'
  | 'machine-limit-reached';

/** Derived, never stored. A `machine-limit-reached` look is shown once, on the machine panel, not per forge. */
export interface ForgeLook {
  trackerId: string;
  kind:      ForgeLookKind;
}

export interface MachineFacts {
  cpuCount:                     number;
  /** The sum of every forge's own agent limit, as the forges last reported them. */
  agentsAskedForByForgeLimits:  number;
  /** `null` while no forge enforces a machine limit. */
  ticketsWaitingForMachineSlot: number | null;
}

/** Each figure sums the forges that report it; a forge that cannot vouch for a figure is named in `incompleteFor`. */
export interface FleetFigures {
  waitingOnUser:  number;
  agentsInFlight: number;
  /** `null` while no forge enforces a machine limit. */
  machineLimit:   number | null;
  readyTickets:   number;
  deliveredToday: number;
  tokensToday:    number;
  openIncidents:  number;
  incompleteFor:  string[];
}

export type SettingsFileState = 'read' | 'absent' | 'newer-version' | 'unreadable';

export interface KnownContracts {
  summary: number;
  monitor: number;
  control: number;
  embed:   number;
}

/** What the Forges view and the empty screen say about Gaia itself. */
export interface GaiaFacts {
  gaiaVersion:       string;
  address:           string;
  homeFolder:        string;
  registryPath:      string;
  /** The program Gaia runs a forge verb with: the settings' path, else the one found; `null` when neither exists. */
  forgeProgramInUse: string | null;
  settingsFile:      SettingsFileState;
  knownContracts:    KnownContracts;
}

export interface FleetSnapshot {
  forges:     ForgeReading[];
  attention:  FleetAttentionItem[];
  needsALook: ForgeLook[];
  agents:     FleetAgentRow[];
  activity:   FleetActivityEntry[];
  machine:    MachineFacts;
  figures:    FleetFigures;
  settings:   GaiaSettings;
  gaia:       GaiaFacts;
}
