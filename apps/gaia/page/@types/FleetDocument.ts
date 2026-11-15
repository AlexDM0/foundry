/**
 * The page contract: what `GET /api/fleet` and the `fleet` event carry, and the event stream's handshake. The server's internal model is
 * mapped out to this shape at its edge, so a change inside the server reaches the page only through a change here, and one a page of the
 * older shape cannot read through a new `fleetVersion` and a new version of the fleet and events routes.
 */
import type { CONTRACT_VERSIONS } from '../../src/shared/constants/ContractVersions.ts';

/** `newer-contract` and `older-contract`: Gaia reads nothing of the forge; `versions` says why when the forge's system version decided it. */
export type FleetDocumentFidelity = 'full' | 'counts-only' | 'newer-contract' | 'older-contract' | 'unreachable' | 'dormant' | 'repository-missing';

export type FleetDocumentCondition = 'live' | 'paused' | 'held' | 'passing-baton' | 'starting' | 'dormant' | 'unreachable' | 'unreadable' | 'missing';

export interface FleetDocumentContracts {
  summary: number | null;
  monitor: number | null;
  control: number | null;
  embed:   number | null;
}

/** A system version: a minor only adds, a major may break a client of an older major. */
export interface FleetDocumentSystemVersion {
  major: number;
  minor: number;
}

/**
 * How the forge's system version stands to the forge versions this Gaia knows (`FleetDocumentGaia`). `newer` and `older`: they cannot
 * talk, and this Gaia or the forge needs an update. `ahead`: read in full with what this Gaia knows; `behind`: read in full without this
 * Gaia's newest features for it. `not-reported`: the forge publishes no versions and is read as before them.
 */
export type FleetDocumentVersionsVerdict = 'newer' | 'older' | 'ahead' | 'behind' | 'current' | 'not-reported';

/** The forge's own versions, both `null` when it reported none. */
export interface FleetDocumentForgeVersions {
  verdict:          FleetDocumentVersionsVerdict;
  current:          FleetDocumentSystemVersion | null;
  minimumSupported: FleetDocumentSystemVersion | null;
}

export interface FleetDocumentConcurrency {
  limit:                        number;
  agentsInFlight:               number;
  machineLimit:                 number | null;
  machineAgentsInFlight:        number | null;
  ticketsWaitingForMachineSlot: number | null;
}

/** `text` is the forge's sentence, in Gaia's words where the forge's names a command (D10). */
export interface FleetDocumentNotice {
  kind: string;
  text: string;
}

/** The usage limit hit, both `null` when none was; and the newest usage window the forge's sessions reported, both `null` when none did. */
export interface FleetDocumentUsage {
  resetsAt:              string | null;
  window:                string | null;
  currentWindow:         string | null;
  currentWindowResetsAt: string | null;
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
  turn:                'between-turns' | 'mid-turn' | null;
  messagesWaiting:     number | null;
  lastLine:            string | null;
  waitingOnDecisionId: string | null;
  route:               string | null;
}

export type FleetDocumentActivityCategory = 'needs-user' | 'landed' | 'agent' | 'forge';

/** `flint-brain`: the run of a brain that ended, with its tokens (G2). */
export type FleetDocumentActivityKind = 'flint-brain';

export interface FleetDocumentActivityEntry {
  logPosition: number;
  at:          string;
  category:    FleetDocumentActivityCategory;
  text:        string;
  route:       string | null;
  kind:        FleetDocumentActivityKind | null;
  tokens:      number | null;
}

export type FleetDocumentBrainState = 'off' | 'starting' | 'running' | 'ended' | 'refused';

export interface FleetDocumentBrainMove {
  at:     string;
  intent: string;
  emote:  string | null;
}

/** `sentence` is `null` when the forge's sentence names a command Gaia has no words for (D10); the page then words the refusal from its code. */
export interface FleetDocumentBrainRefusal {
  code:     string;
  sentence: string | null;
}

/**
 * A forge's Flint brain as its forge reports it, each fact `null` when the forge did not report it. The page counts down to `endsAt` for
 * display and decides nothing from it: the brain's row and line leave when the forge reports `ended`.
 */
export interface FleetDocumentBrain {
  state:       FleetDocumentBrainState;
  startedAt:   string | null;
  endsAt:      string | null;
  startedBy:   'bridge' | 'gaia' | null;
  model:       string | null;
  effort:      string | null;
  tokens:      number | null;
  calls:       number | null;
  recentMoves: FleetDocumentBrainMove[];
  endedAt:     string | null;
  endedReason: 'time' | 'stopped' | 'usage-limit' | 'failed' | null;
  /** The forge's words for the brain's state, `null` when they name a command (D10). */
  sentence:    string | null;
  refusal:     FleetDocumentBrainRefusal | null;
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
  /** `not-reported` under a monitor older than contract 3 and for a forge without Flint: the brain is then absent, not empty. */
  brain:             FleetDocumentBrain | 'not-reported';
  versions:          FleetDocumentForgeVersions;
}

export interface FleetDocumentFleetAttentionItem extends FleetDocumentAttentionItem {
  trackerId: string;
}

/** A running brain's row has the role `brain` and the id `flint-brain`, and counts against no forge's limit and not the machine's. */
export interface FleetDocumentFleetAgentRow extends FleetDocumentAgentRow {
  trackerId:          string;
  countsAgainstLimit: boolean;
}

export interface FleetDocumentFleetActivityEntry extends FleetDocumentActivityEntry {
  trackerId: string;
}

export type FleetDocumentLookKind =
  | 'unreachable'
  | 'newer-contract'
  | 'older-contract'
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
  /** This Gaia's own system version, the forge version it is built for, and the oldest forge version it still talks to. */
  versions:          { systemVersion: FleetDocumentSystemVersion; supportedForgeVersion: FleetDocumentSystemVersion; minimumForgeVersion: FleetDocumentSystemVersion };
}

/** The first event of `GET /api/events`, before any document: the system version of the Gaia that serves the stream. */
export interface FleetStreamHandshake {
  systemVersion: FleetDocumentSystemVersion;
}

/** What each `fleet` event carries: the document and the system version of the Gaia that sent it. */
export type FleetEventDocument = FleetDocument & { systemVersion: FleetDocumentSystemVersion };

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
