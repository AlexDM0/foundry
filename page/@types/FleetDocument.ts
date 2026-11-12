/**
 * The page contract: what `GET /api/fleet` and the `fleet` event carry. The server's internal model is mapped out to this shape at its
 * edge, so a change inside the server reaches the page only through a change here and a new `fleetVersion`.
 */
import type { CONTRACT_VERSIONS } from '../../src/shared/constants/ContractVersions.ts';

export type FleetDocumentFidelity = 'full' | 'counts-only' | 'newer-contract' | 'unreachable' | 'dormant' | 'repository-missing';

export type FleetDocumentCondition = 'live' | 'paused' | 'held' | 'passing-baton' | 'starting' | 'dormant' | 'unreachable' | 'unreadable' | 'missing';

export interface FleetDocumentContracts {
  summary: number | null;
  monitor: number | null;
  control: number | null;
  embed:   number | null;
}

export interface FleetDocumentConcurrency {
  limit:                        number;
  agentsInFlight:               number;
  machineLimit:                 number | null;
  machineAgentsInFlight:        number | null;
  ticketsWaitingForMachineSlot: number | null;
}

export interface FleetDocumentNotice {
  kind: string;
  text: string;
}

export interface FleetDocumentUsage {
  resetsAt: string | null;
  window:   string | null;
}

export interface FleetDocumentToday {
  deliveredTickets: number;
  tokens:           number;
}

export type FleetDocumentAttentionKind = 'escalated-question' | 'question' | 'draft-ticket' | 'filing-draft' | 'review' | 'merge-accept';

export type FleetDocumentStampWord = 'opened' | 'filed' | 'ready since' | 'reviewed';

export type FleetDocumentActionLabel = 'Answer' | 'Ready' | 'Review' | 'Accept';

export interface FleetDocumentAttentionItem {
  key:                     string;
  kind:                    FleetDocumentAttentionKind;
  idText:                  string;
  ticketIds:               string[];
  subject:                 string;
  jobId:                   string | null;
  askedBy:                 string | null;
  decisionKind:            string | null;
  escalatedFromIncidentId: string | null;
  metaText:                string | null;
  stamp:                   string;
  stampWord:               FleetDocumentStampWord;
  actionLabel:             FleetDocumentActionLabel;
  route:                   string;
}

/** A forge read through its summary reports only the job id, kind, role, tickets, state and tokens; the rest is `null`, never zero. */
export interface FleetDocumentAgentRow {
  jobId:               string;
  kind:                string;
  role:                string | null;
  state:               string;
  ticketIds:           string[];
  tokens:              number;
  ticketTitle:         string | null;
  attempt:             number | null;
  startedAt:           string | null;
  calls:               number | null;
  callBudget:          number | null;
  toolCalls:           number | null;
  lastToolCall:        string | null;
  runningSubagents:    number | null;
  silentSweeps:        number | null;
  quiet:               boolean | null;
  turn:                number | null;
  messagesWaiting:     number | null;
  lastLine:            string | null;
  waitingOnDecisionId: string | null;
  route:               string | null;
}

export type FleetDocumentActivityCategory = 'needs-user' | 'landed' | 'agent' | 'forge';

export interface FleetDocumentActivityEntry {
  logPosition: number;
  at:          string;
  category:    FleetDocumentActivityCategory;
  text:        string;
  route:       string | null;
}

export interface FleetDocumentForge {
  trackerId:         string;
  project:           string;
  root:              string;
  fidelity:          FleetDocumentFidelity;
  condition:         FleetDocumentCondition;
  url:               string | null;
  processId:         number | null;
  contracts:         FleetDocumentContracts;
  codeVersion:       string | null;
  lastReportedAt:    string | null;
  overseerStartedAt: string | null;
  lastCommand:       string | null;
  lastChangedAt:     string | null;
  concurrency:       FleetDocumentConcurrency | null;
  readyTicketCount:  number | null;
  openIncidents:     number | null;
  attention:         FleetDocumentAttentionItem[];
  attentionCount:    number | null;
  agents:            FleetDocumentAgentRow[];
  notices:           FleetDocumentNotice[];
  warnings:          FleetDocumentNotice[];
  activity:          FleetDocumentActivityEntry[];
  today:             FleetDocumentToday | null;
  usage:             FleetDocumentUsage | null;
}

export interface FleetDocumentFleetAttentionItem extends FleetDocumentAttentionItem {
  trackerId: string;
}

export interface FleetDocumentFleetAgentRow extends FleetDocumentAgentRow {
  trackerId: string;
}

export interface FleetDocumentFleetActivityEntry extends FleetDocumentActivityEntry {
  trackerId: string;
}

export type FleetDocumentLookKind =
  | 'unreachable'
  | 'newer-contract'
  | 'baton-pass-failed'
  | 'launches-held'
  | 'new-code'
  | 'counts-only'
  | 'dormant-with-ready-tickets'
  | 'machine-limit-reached';

export interface FleetDocumentLook {
  trackerId: string;
  kind:      FleetDocumentLookKind;
}

export interface FleetDocumentMachine {
  cpuCount:                     number;
  agentsAskedForByForgeLimits:  number;
  ticketsWaitingForMachineSlot: number | null;
}

export interface FleetDocumentFigures {
  waitingOnUser:  number;
  agentsInFlight: number;
  machineLimit:   number | null;
  readyTickets:   number;
  deliveredToday: number;
  tokensToday:    number;
  openIncidents:  number;
  incompleteFor:  string[];
}

export type FleetDocumentThemeChoice = 'auto' | 'light' | 'dark';

export type FleetDocumentNotificationKind =
  | 'escalated-questions'
  | 'questions'
  | 'reviews-and-merge-accepts'
  | 'forges-held-or-unreachable'
  | 'quiet-agents'
  | 'machine-at-agent-limit'
  | 'draft-tickets';

export interface FleetDocumentSettings {
  theme:              FleetDocumentThemeChoice;
  hiddenTrackerIds:   string[];
  forgeProgramPath:   string | null;
  notifications:      { enabled: boolean; kinds: Record<FleetDocumentNotificationKind, boolean> };
  startForgesAtLogin: boolean;
}

export type FleetDocumentSettingsFileState = 'read' | 'absent' | 'newer-version' | 'unreadable';

export interface FleetDocumentGaia {
  gaiaVersion:       string;
  address:           string;
  homeFolder:        string;
  registryPath:      string;
  forgeProgramInUse: string | null;
  settingsFile:      FleetDocumentSettingsFileState;
  knownContracts:    { summary: number; monitor: number; control: number; embed: number };
}

export interface FleetDocument {
  fleetVersion: typeof CONTRACT_VERSIONS.gaiaFleetDocument;
  forges:       FleetDocumentForge[];
  attention:    FleetDocumentFleetAttentionItem[];
  needsALook:   FleetDocumentLook[];
  agents:       FleetDocumentFleetAgentRow[];
  activity:     FleetDocumentFleetActivityEntry[];
  machine:      FleetDocumentMachine;
  figures:      FleetDocumentFigures;
  settings:     FleetDocumentSettings;
  gaia:         FleetDocumentGaia;
}
