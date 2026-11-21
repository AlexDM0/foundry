/**
 * The page contract: what `GET /api/fleet` and the `fleet` event carry, and the event stream's handshake. The server's internal model is
 * mapped out to this shape at its edge, so a change inside the server reaches the page only through a change here, and one a page of the
 * older shape cannot read through a new `fleetVersion` and a new version of the fleet and events routes.
 */
import type { PAGE_CONTRACT_VERSIONS } from '../../src/shared/constants/PageContractVersions.ts';

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
 * How the forge's system version stands to the one forge version this Gaia supports (`FleetDocumentGaia`). `newer` and `older`: they
 * cannot talk, and this Gaia or the forge needs an update; a forge that serves no versions is `older`. `ahead`: read with what this Gaia
 * knows, while full use of the forge needs a newer Gaia. `current`: the supported version.
 */
export type FleetDocumentVersionsVerdict = 'newer' | 'older' | 'ahead' | 'current';

/** The forge's own versions, both `null` for a forge that serves no versions. */
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

/** A tab of a forge's board, as the page's board router names it. */
export type FleetDocumentBoardTab = 'kanban' | 'waves' | 'progress' | 'epics' | 'tickets' | 'agents' | 'questions' | 'assistant' | 'intake' | 'pipeline';

/** A place on a forge's board, which the page opens at `#forge/<trackerId>/<tab>[/<item segments>]`. */
export interface FleetDocumentBoardRoute {
  tab:  FleetDocumentBoardTab;
  item: string | null;
}

/**
 * A forge alert (`forge-crashed`, `forge-down`, `forge-hung`) and the fleet's `agents-ended-on-outage` are Gaia's, raised from the forges'
 * served presence; the rest are the forge's.
 */
export type FleetDocumentAttentionKind =
  | 'escalated-question'
  | 'question'
  | 'draft-ticket'
  | 'filing-draft'
  | 'review'
  | 'merge-accept'
  | 'forge-crashed'
  | 'forge-down'
  | 'forge-hung'
  | 'agents-ended-on-outage';

export type FleetDocumentStampWord = 'opened' | 'filed' | 'ready since' | 'reviewed' | 'crashed' | 'last reported';

/** `Start` sends the forge's start; every other label opens the entry's place on the forge's board. */
export type FleetDocumentActionLabel = 'Answer' | 'Ready' | 'Review' | 'Accept' | 'Start' | 'Open';

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
  /** `null` where the forge names a place Gaia's board does not know; the forge then opens at its default tab. */
  boardRoute:              FleetDocumentBoardRoute | null;
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
  boardRoute:          FleetDocumentBoardRoute | null;
}

export type FleetDocumentActivityCategory = 'needs-user' | 'landed' | 'agent' | 'forge';

/** `flint-brain`: the run of a brain that ended, with its tokens (G2). */
export type FleetDocumentActivityKind = 'flint-brain';

export interface FleetDocumentActivityEntry {
  logPosition: number;
  at:          string;
  category:    FleetDocumentActivityCategory;
  text:        string;
  boardRoute:  FleetDocumentBoardRoute | null;
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
  startedBy:   'bridge' | 'api' | null;
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

/**
 * How a forge is present, told from what it serves: `crashed` the registry says so; `stopped` and `handed-over` the registry says so and no
 * Overseer answers; `down` the registry says serving and no Overseer answers, gone or hung; `hung` its API answers and Talos stopped
 * supervising its agents; `unknown` the registry holds no presence of a forge that does not answer.
 */
export type FleetDocumentPresenceState = 'serving' | 'hung' | 'stopped' | 'handed-over' | 'crashed' | 'down' | 'unknown';

export interface FleetDocumentPresence {
  state:      FleetDocumentPresenceState;
  generation: number | null;
  /** Shown only. */
  at:         string | null;
}

/** The registry's summary of a crash; `suspected` for a crash suspected before a reboot. */
export interface FleetDocumentCrashSummary {
  component:    'overseer' | 'talos';
  suspected:    boolean;
  errorName:    string | null;
  errorMessage: string | null;
}

export interface FleetDocumentCrashLogEntry {
  /** The crash log's own number, the key of its route. */
  number:     number;
  /** The Baton generation that crashed, shown only. */
  generation: number | null;
  component:  'hephaestus' | 'talos' | 'unknown';
  suspected:  boolean;
  /** Shown only. */
  recordedAt: string;
}

export type FleetDocumentInterruptionCause =
  | 'child-lost'
  | 'agent-crashed'
  | 'reboot'
  | 'answer-delivery'
  | 'usage-limit'
  | 'handoff-red'
  | 'forced-stop-refused'
  | 'authentication-failed'
  | 'talos-paused'
  | 'lease-ended'
  | 'network-outage'
  | 'forge-stopped'
  | 'forge-crashed';

/** `nothing`: it resumes by itself at the forge's next pass; `never`: no resume restarts it. */
export type FleetDocumentResumeWait = 'instruction' | 'answer' | 'decision' | 'nothing' | 'never';

export interface FleetDocumentWaitingJob {
  jobId:     string;
  kind:      string;
  ticketIds: string[];
  cause:     FleetDocumentInterruptionCause;
  waitsFor:  FleetDocumentResumeWait;
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
  /** The forge program the registry names for this forge; `null` when it names none, and Gaia then starts it with the one in its settings. */
  program:           string | null;
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
  /** `null` for a forge read without its versions, such as a dormant or an unreachable one. */
  versions:          FleetDocumentForgeVersions | null;
  presence:          FleetDocumentPresence;
  /** The registry's, only for a crashed forge. */
  crashSummary:      FleetDocumentCrashSummary | null;
  /** Listed by the presence of a live forge; each log is read on request at `/api/v1/forges/<trackerId>/crash-logs/<number>`. */
  crashLogs:         FleetDocumentCrashLogEntry[];
  /** Empty for a forge not answering. */
  waitingWork:       FleetDocumentWaitingJob[];
  /** Its jobs a network outage stopped, which wait for User's resume; none for a forge not answering. */
  outageEndings:     number;
}

/** `trackerId` is `null` only for `agents-ended-on-outage`, the fleet's alert, which names the forges whose `outageEndings` it sums. */
export interface FleetDocumentFleetAttentionItem extends FleetDocumentAttentionItem {
  trackerId: string | null;
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
  /** This Gaia's own system version and the one forge version it supports. */
  versions:          { systemVersion: FleetDocumentSystemVersion; supportedForgeVersion: FleetDocumentSystemVersion };
}

/** The first event of `GET /api/events`, before any document: the system version of the Gaia that serves the stream. */
export interface FleetStreamHandshake {
  systemVersion: FleetDocumentSystemVersion;
}

/** What each `fleet` event carries: the document and the system version of the Gaia that sent it. */
export type FleetEventDocument = FleetDocument & { systemVersion: FleetDocumentSystemVersion };

export interface FleetDocument {
  fleetVersion:       typeof PAGE_CONTRACT_VERSIONS.gaiaFleetDocument;
  forges:             FleetDocumentForge[];
  attention:          FleetDocumentFleetAttentionItem[];
  needsALook:         FleetDocumentLook[];
  agents:             FleetDocumentFleetAgentRow[];
  activity:           FleetDocumentFleetActivityEntry[];
  machine:            FleetDocumentMachine;
  figures:            FleetDocumentFigures;
  settings:           FleetDocumentSettings;
  gaia:               FleetDocumentGaia;
  /** Every forge's `outageEndings` summed. */
  outageEndingsTotal: number;
}
