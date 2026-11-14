/**
 * What the Agents view shows of a fleet document: the page title's figures, the two filters with their counts, the rows the filters
 * leave in the document's order and the same rows grouped by forge in the registry's order, each forge's running brain last under its
 * jobs, and the selected agent or brain. The selection and the filters live in the route, so both survive a new document; a value the forge
 * did not report is `null` here and a dash on screen, never zero. A brain counts in no figure, count or limit but All and its own segment.
 */
import type { SegmentOption } from 'design-system/SegmentedControl';
import type { TagTone }       from 'design-system/Tag';

import type { FleetDocument, FleetDocumentFleetAgentRow, FleetDocumentForge } from '../../@types/FleetDocument.ts';
import type { CommandStates }                                                 from '../../api/CommandSender.ts';
import type { DotCondition }                                                  from '../../design-system/ConditionDot.tsx';
import type { PageFigure }                                                    from '../../design-system/PageTitle.tsx';
import type { DotRole }                                                       from '../../design-system/RoleDot.tsx';
import { ForgeContractUtil }                                                  from '../../shared/utils/ForgeContractUtil.ts';
import { ForgeTextUtil }                                                      from '../../shared/utils/ForgeTextUtil.ts';
import { HashRouter, type SelectedAgent }                                     from '../../shell/HashRouter.ts';
import { RailModel, type RailMachine }                                        from '../../shell/RailModel.ts';
import {
  type AgentConditionFilter,
  type AgentFilters,
  type AgentRoleFilter,
  AgentsFilters,
} from './AgentsFilters.ts';
import {
  type BrainCommandRefusal,
  BrainModel,
  type BrainRowContent,
  type GroupBrainContent,
  type SelectedBrainContent,
} from './BrainModel.ts';
import { AgentTextUtil } from './utils/AgentTextUtil.ts';

/** The jobs: a running brain's row counts against no limit and is not one of them. */
function jobRowsOf(fleetDocument: FleetDocument): FleetDocumentFleetAgentRow[] {
  return fleetDocument.agents.filter((row) => row.countsAgainstLimit);
}

function brainRowsOf(fleetDocument: FleetDocument): FleetDocumentFleetAgentRow[] {
  return fleetDocument.agents.filter((row) => BrainModel.rowIsABrain(row));
}

/** The rows the table draws: the jobs, and each running brain. */
function drawnRowsOf(fleetDocument: FleetDocument): FleetDocumentFleetAgentRow[] {
  return fleetDocument.agents.filter((row) => row.countsAgainstLimit || BrainModel.rowIsABrain(row));
}

export interface AgentFlag {
  readonly text: string;
  readonly tone: Exclude<TagTone, 'state'>;
}

/** `asks` is the orange of an agent that waits on User; `paused` the grey of one that waits on something else. */
export type AgentMeterTone = 'neutral' | 'builder' | 'reviewer' | 'asks' | 'paused';

export interface AgentCalls {
  readonly text:  string;
  /** `null` when the forge reports no call budget: then there is no meter, not an empty one. */
  readonly meter: { readonly used: number; readonly whole: number; readonly label: string; readonly tone: AgentMeterTone } | null;
}

export interface AgentRowContent {
  readonly key:           string;
  readonly project:       string;
  readonly jobId:         string;
  readonly selectHref:    string;
  readonly selectLabel:   string;
  readonly jobHref:       string;
  readonly role:          string | null;
  readonly ticketIdsText: string | null;
  readonly ticketTitle:   string | null;
  readonly dotRole:       DotRole | null;
  readonly stateText:     string;
  readonly flags:         readonly AgentFlag[];
  readonly runningText:   string | null;
  readonly calls:         AgentCalls | null;
  readonly tokensText:    string;
  readonly lastToolCall:  string | null;
  readonly isSelected:    boolean;
}

/**
 * A forge's head row over its agents: its condition, its agents against its limit, its brain's part, and what of it waits on User or holds its
 * launches; under it its job rows, then its running brain's row.
 */
export interface AgentGroupContent {
  readonly trackerId:    string;
  readonly project:      string;
  /** `null` for agents whose forge the document no longer holds. */
  readonly condition:    DotCondition | null;
  /** `4 / 5` against the forge's limit, or the count alone when it reports none. */
  readonly agentsFigure: string;
  readonly agentsWord:   string;
  /** `null` when the forge reports no limit: then there is no meter, not an empty one. */
  readonly slots:        { readonly filled: number; readonly limit: number; readonly label: string } | null;
  readonly noteText:     string | null;
  readonly brain:        GroupBrainContent;
  readonly brainRefusal: BrainCommandRefusal | null;
  readonly rows:         readonly AgentRowContent[];
  readonly brainRow:     BrainRowContent | null;
}

export interface AgentFact {
  readonly label: string;
  readonly value: string;
}

export type SelectedAgentContent =
  | SelectedBrainContent
  | { readonly kind: 'none-selected' }
  | { readonly kind: 'no-longer-running'; readonly jobId: string; readonly project: string }
  | {
    readonly kind:          'running';
    readonly jobId:         string;
    readonly role:          string | null;
    readonly dotRole:       DotRole | null;
    readonly stateText:     string;
    readonly runningText:   string | null;
    readonly flags:         readonly AgentFlag[];
    readonly project:       string;
    readonly ticketIdsText: string | null;
    readonly ticketTitle:   string | null;
    readonly calls:         AgentCalls | null;
    readonly tokensText:    string;
    readonly lastToolCall:  string | null;
    readonly facts:         readonly AgentFact[];
    readonly lastLine:      string | null;
    readonly openHref:      string;
    readonly openLabel:     string;
  };

export interface AgentsContent {
  /** The job rows; the view says no agent runs only when neither a job nor a brain does. */
  readonly agentCount:          number;
  readonly brainCount:          number;
  /** The jobs against the machine's limit, `10 / 12`, or the jobs alone when it reports none. */
  readonly machineAgentsFigure: string;
  readonly filters:             AgentFilters;
  readonly roleOptions:         readonly SegmentOption<AgentRoleFilter>[];
  readonly conditionOptions:    readonly SegmentOption<AgentConditionFilter>[];
  readonly rows:                readonly AgentRowContent[];
  /** The same rows under their forges, in the registry's order; a forge the filters leave no row of has no group. */
  readonly groups:              readonly AgentGroupContent[];
  readonly selected:            SelectedAgentContent;
  /** This machine's agents against its limit, shown when no agent runs. */
  readonly machine:             RailMachine;
}

export interface AgentsModelInput {
  readonly fleetDocument:      FleetDocument;
  readonly selectedAgent:      SelectedAgent | null;
  readonly query:              string;
  /** The page's clock, for running times shown and never compared. */
  readonly readAtMilliseconds: number;
  /** The time zone a clock time is printed in; `undefined` is the browser's own. */
  readonly timeZone:           string | undefined;
  /** Whether a brain command to a forge is on its way, and how the last one failed. */
  readonly commandStates:      CommandStates;
}

const AGENTS_ROUTE_OF_THE_BRIDGE = '#agents/';

const METER_TONE_OF_DOT_ROLE: Readonly<Partial<Record<DotRole, AgentMeterTone>>> = {
  'builder':    'builder',
  'reviewer':   'reviewer',
  'needs-user': 'asks',
  'waiting':    'paused',
};

const DOT_ROLE_OF_ROLE: Readonly<Record<string, DotRole>> = {
  builder:  'builder',
  reviewer: 'reviewer',
};

function forgeOf(fleetDocument: FleetDocument, trackerId: string): FleetDocumentForge | null {
  return fleetDocument.forges.find((forge) => forge.trackerId === trackerId) ?? null;
}

/** A tracker id the document holds no forge for stands in for its project. */
function projectOf(fleetDocument: FleetDocument, trackerId: string): string {
  return forgeOf(fleetDocument, trackerId)?.project ?? trackerId;
}

/** The agent in its forge's own Agents view when the forge opens in place, else the forge's row on the Forges view. */
function jobHrefOf(fleetDocument: FleetDocument, row: FleetDocumentFleetAgentRow): string {
  const forge = forgeOf(fleetDocument, row.trackerId);
  if (forge !== null && ForgeContractUtil.canOpenInPlace(forge)) {
    const bridgeFragment = row.route ?? `${AGENTS_ROUTE_OF_THE_BRIDGE}${encodeURIComponent(row.jobId)}`;
    return HashRouter.fragmentOf({ view: 'forge', trackerId: row.trackerId, bridgeFragment });
  }
  return HashRouter.fragmentOf({ view: 'forges', addingARepository: false, forgeInView: row.trackerId });
}

function agentsFragmentOf(selectedAgent: SelectedAgent | null, filters: AgentFilters): string {
  return HashRouter.fragmentOf({ view: 'agents', selectedAgent, query: AgentsFilters.queryOf(filters) });
}

function flagsOf(row: FleetDocumentFleetAgentRow): AgentFlag[] {
  const flags: AgentFlag[] = [];
  if (row.waitingOnDecisionId !== null) flags.push({ text: `asks you · ${row.waitingOnDecisionId}`, tone: 'warn' });
  if (row.quiet === true) {
    const sweepsText = row.silentSweeps === null ? '' : ` · ${AgentTextUtil.countedPhrase(row.silentSweeps, 'sweep', 'sweeps')}`;
    flags.push({ text: `quiet${sweepsText}`, tone: 'neutral' });
  }
  return flags;
}

/** An agent that asks User a question is orange, as everything that waits on User; one that waits on anything else is grey. */
function dotRoleOf(row: FleetDocumentFleetAgentRow): DotRole | null {
  if (row.waitingOnDecisionId !== null) return 'needs-user';
  if (AgentTextUtil.stateIsWaiting(row.state)) return 'waiting';
  if (row.role === null || !Object.hasOwn(DOT_ROLE_OF_ROLE, row.role)) return null;
  return DOT_ROLE_OF_ROLE[row.role] ?? null;
}

function callsOf(row: FleetDocumentFleetAgentRow, dotRole: DotRole | null): AgentCalls | null {
  if (row.calls === null) return null;
  if (row.callBudget === null) return { text: String(row.calls), meter: null };
  return {
    text:  `${row.calls} / ${row.callBudget}`,
    meter: {
      used:  row.calls,
      whole: row.callBudget,
      label: `${row.calls} of ${row.callBudget} calls`,
      tone:  (dotRole === null ? undefined : METER_TONE_OF_DOT_ROLE[dotRole]) ?? 'neutral',
    },
  };
}

function ticketIdsTextOf(row: FleetDocumentFleetAgentRow): string | null {
  return row.ticketIds.length === 0 ? null : row.ticketIds.map((ticketId) => `#${ticketId}`).join(', ');
}

function runningTextOf(row: FleetDocumentFleetAgentRow, readAtMilliseconds: number): string | null {
  return row.startedAt === null ? null : AgentTextUtil.runningTimeText(row.startedAt, readAtMilliseconds);
}

function isTheSelectedAgent(row: FleetDocumentFleetAgentRow, selectedAgent: SelectedAgent | null): boolean {
  return selectedAgent !== null && selectedAgent.trackerId === row.trackerId && selectedAgent.jobId === row.jobId;
}

function rowContentOf(input: AgentsModelInput, filters: AgentFilters, row: FleetDocumentFleetAgentRow): AgentRowContent {
  const { fleetDocument, selectedAgent, readAtMilliseconds } = input;
  const project = projectOf(fleetDocument, row.trackerId);
  const dotRole = dotRoleOf(row);
  return {
    key:           `${row.trackerId}/${row.jobId}`,
    project,
    jobId:         row.jobId,
    selectHref:    agentsFragmentOf({ trackerId: row.trackerId, jobId: row.jobId }, filters),
    selectLabel:   `${project}, ${row.jobId}`,
    jobHref:       jobHrefOf(fleetDocument, row),
    role:          row.role,
    ticketIdsText: ticketIdsTextOf(row),
    ticketTitle:   row.ticketTitle,
    dotRole,
    stateText:     AgentTextUtil.stateWordOf(row.state, row.role),
    flags:         flagsOf(row),
    runningText:   runningTextOf(row, readAtMilliseconds),
    calls:         callsOf(row, dotRole),
    tokensText:    AgentTextUtil.groupedNumberText(row.tokens),
    lastToolCall:  row.lastToolCall,
    isSelected:    isTheSelectedAgent(row, selectedAgent),
  };
}

/** The forge tells only whether a session is inside a turn or between two, not how many it took. */
const TURN_WORDS: Readonly<Record<NonNullable<FleetDocumentFleetAgentRow['turn']>, string>> = {
  'between-turns': 'Between turns',
  'mid-turn':      'Mid-turn',
};

function subagentsTextOf(runningSubagents: number | null): string | null {
  if (runningSubagents === null) return null;
  return runningSubagents === 0 ? 'none' : `${runningSubagents} running`;
}

function factsOf(row: FleetDocumentFleetAgentRow): AgentFact[] {
  const callsText = row.calls === null ? null : `${row.calls}${row.callBudget === null ? '' : ` of ${row.callBudget}`}`;
  const facts: readonly (readonly [label: string, value: string | null])[] = [
    ['Turn', row.turn === null ? null : TURN_WORDS[row.turn]],
    ['Calls', callsText],
    ['Tool calls', row.toolCalls === null ? null : String(row.toolCalls)],
    ['Subagents', subagentsTextOf(row.runningSubagents)],
    ['Messages waiting', row.messagesWaiting === null ? null : String(row.messagesWaiting)],
  ];
  return facts.flatMap(([label, value]) => (value === null ? [] : [{ label, value }]));
}

function selectedContentOf(input: AgentsModelInput): SelectedAgentContent {
  const { fleetDocument, selectedAgent } = input;
  if (selectedAgent === null) return { kind: 'none-selected' };
  if (BrainModel.selectionIsABrain(selectedAgent.jobId)) return BrainModel.selectedBrainOf(input, selectedAgent.trackerId);
  const project = projectOf(fleetDocument, selectedAgent.trackerId);
  const row = jobRowsOf(fleetDocument).find((candidate) => isTheSelectedAgent(candidate, selectedAgent));
  if (row === undefined) return { kind: 'no-longer-running', jobId: selectedAgent.jobId, project };
  const dotRole = dotRoleOf(row);
  return {
    kind:          'running',
    jobId:         row.jobId,
    role:          row.role,
    dotRole,
    stateText:     AgentTextUtil.stateWordOf(row.state, row.role),
    runningText:   runningTextOf(row, input.readAtMilliseconds),
    flags:         flagsOf(row),
    project,
    ticketIdsText: ticketIdsTextOf(row),
    ticketTitle:   row.ticketTitle,
    calls:         callsOf(row, dotRole),
    tokensText:    AgentTextUtil.groupedNumberText(row.tokens),
    lastToolCall:  row.lastToolCall,
    facts:         factsOf(row),
    lastLine:      row.lastLine,
    openHref:      jobHrefOf(fleetDocument, row),
    openLabel:     `Open ${row.jobId} in its forge`,
  };
}

function machineAgentsFigureOf(fleetDocument: FleetDocument): string {
  const agentCount = jobRowsOf(fleetDocument).length;
  const { machineLimit } = fleetDocument.figures;
  return machineLimit === null ? String(agentCount) : `${agentCount} / ${machineLimit}`;
}

/**
 * The page title's figures, over the job rows: the agents against the machine limit when one is known, their forges and their tokens; then
 * the running brains, outside the limit, when one runs.
 */
function titleFiguresOf(fleetDocument: FleetDocument): PageFigure[] {
  const agents = jobRowsOf(fleetDocument);
  const brainCount = brainRowsOf(fleetDocument).length;
  const forgeCount = new Set(agents.map((row) => row.trackerId)).size;
  const tokens = agents.reduce((sum, row) => sum + row.tokens, 0);
  const figures: PageFigure[] = [
    { value: machineAgentsFigureOf(fleetDocument), label: fleetDocument.figures.machineLimit === null && agents.length === 1 ? 'agent' : 'agents' },
    { value: String(forgeCount), label: forgeCount === 1 ? 'forge' : 'forges' },
    { value: AgentTextUtil.groupedNumberText(tokens), label: tokens === 1 ? 'token in flight' : 'tokens in flight' },
  ];
  if (brainCount === 0) return figures;
  return [...figures, { value: String(brainCount), label: brainCount === 1 ? 'brain, outside the limit' : 'brains, outside the limit' }];
}

/** What waits on User in the forge as its forge counts it, or `null` when it reports no count. */
function waitingCountOf(forge: FleetDocumentForge): number | null {
  return forge.fidelity === 'counts-only' ? forge.attentionCount : forge.attention.length;
}

/** A held forge says so first, as its head's note in orange; then what of it waits on User. */
function groupNoteOf(forge: FleetDocumentForge): string | null {
  const waitingCount = waitingCountOf(forge);
  const parts = [
    forge.condition === 'held' ? ForgeTextUtil.conditionWordInSentenceCaseOf(forge.condition) : null,
    waitingCount === null || waitingCount === 0 ? null : AgentTextUtil.countedPhrase(waitingCount, 'waits on you', 'wait on you'),
  ];
  const shownParts = parts.filter((part) => part !== null);
  return shownParts.length === 0 ? null : shownParts.join(' · ');
}

/** The forge's own job rows count against its limit, whatever the filters leave; a brain's row never does. */
function groupOf(input: AgentsModelInput, trackerId: string, rows: readonly AgentRowContent[], brainRow: BrainRowContent | null): AgentGroupContent {
  const { fleetDocument, commandStates } = input;
  const forge = forgeOf(fleetDocument, trackerId);
  const agentCount = jobRowsOf(fleetDocument).filter((row) => row.trackerId === trackerId).length;
  const limit = forge?.concurrency?.limit ?? null;
  return {
    trackerId,
    project:      forge?.project ?? trackerId,
    condition:    forge === null ? null : ForgeTextUtil.dotConditionOf(forge.condition),
    agentsFigure: limit === null ? String(agentCount) : `${agentCount} / ${limit}`,
    agentsWord:   limit === null && agentCount === 1 ? 'agent' : 'agents',
    slots:        limit === null ? null : {
      filled: agentCount,
      limit,
      label:  `${AgentTextUtil.countedPhrase(agentCount, 'agent', 'agents')} against a limit of ${limit}`,
    },
    noteText:     forge === null ? null : groupNoteOf(forge),
    brain:        BrainModel.groupBrainOf(forge, commandStates),
    brainRefusal: BrainModel.brainCommandRefusalOf(forge, commandStates),
    rows,
    brainRow,
  };
}

type ShownRow =
  | { readonly trackerId: string; readonly kind: 'job'; readonly content: AgentRowContent }
  | { readonly trackerId: string; readonly kind: 'brain'; readonly content: BrainRowContent };

/** The forges in the registry's order, then any forge the document no longer holds, in the order its rows come; a forge's brain under its jobs. */
function groupsOf(input: AgentsModelInput, rows: readonly ShownRow[]): AgentGroupContent[] {
  const { fleetDocument } = input;
  const trackerIds = [...new Set([...fleetDocument.forges.map((forge) => forge.trackerId), ...rows.map((row) => row.trackerId)])];
  return trackerIds.flatMap((trackerId) => {
    const forgeRows = rows.filter((row) => row.trackerId === trackerId);
    const jobRows = forgeRows.flatMap((row) => (row.kind === 'job' ? [row.content] : []));
    const brainRow = forgeRows.flatMap((row) => (row.kind === 'brain' ? [row.content] : []))[0] ?? null;
    return jobRows.length === 0 && brainRow === null ? [] : [groupOf(input, trackerId, jobRows, brainRow)];
  });
}

/** Each filter counts the rows it would leave beside the other filter as it stands; Flint's brain has its segment while one runs or it is chosen. */
function roleOptionsOf(fleetDocument: FleetDocument, filters: AgentFilters): SegmentOption<AgentRoleFilter>[] {
  const rows = drawnRowsOf(fleetDocument).filter((row) => AgentsFilters.rowPassesConditionFilter(row, filters.condition));
  const countOf = (role: AgentRoleFilter) => rows.filter((row) => AgentsFilters.rowPassesRoleFilter(row, role)).length;
  const options: SegmentOption<AgentRoleFilter>[] = [
    { value: 'all', label: 'All', count: countOf('all') },
    { value: 'builders', label: 'Builders', count: countOf('builders') },
    { value: 'reviewers', label: 'Reviewers', count: countOf('reviewers') },
  ];
  const brainSegmentShows = brainRowsOf(fleetDocument).length > 0 || filters.role === 'brain';
  return brainSegmentShows ? [...options, { value: 'brain', label: 'Flint\'s brain', count: countOf('brain') }] : options;
}

function conditionOptionsOf(fleetDocument: FleetDocument, role: AgentRoleFilter): SegmentOption<AgentConditionFilter>[] {
  const rows = drawnRowsOf(fleetDocument).filter((row) => AgentsFilters.rowPassesRoleFilter(row, role));
  return [
    { value: 'every-agent', label: 'Every agent' },
    { value: 'needs-a-look', label: 'Needs a look', count: rows.filter((row) => AgentsFilters.agentNeedsALook(row)).length },
  ];
}

function shownRowOf(input: AgentsModelInput, filters: AgentFilters, row: FleetDocumentFleetAgentRow): ShownRow {
  if (!BrainModel.rowIsABrain(row)) return { trackerId: row.trackerId, kind: 'job', content: rowContentOf(input, filters, row) };
  return { trackerId: row.trackerId, kind: 'brain', content: BrainModel.brainRowContentOf(input, row, filters, isTheSelectedAgent(row, input.selectedAgent)) };
}

function agentsContentOf(input: AgentsModelInput): AgentsContent {
  const { fleetDocument, query } = input;
  const filters = AgentsFilters.filtersOf(query);
  const shownRows = drawnRowsOf(fleetDocument)
    .filter((row) => AgentsFilters.rowPassesFilters(row, filters))
    .map((row) => shownRowOf(input, filters, row));
  return {
    agentCount:          jobRowsOf(fleetDocument).length,
    brainCount:          brainRowsOf(fleetDocument).length,
    machineAgentsFigure: machineAgentsFigureOf(fleetDocument),
    filters,
    roleOptions:         roleOptionsOf(fleetDocument, filters),
    conditionOptions:    conditionOptionsOf(fleetDocument, filters.role),
    rows:                shownRows.flatMap((row) => (row.kind === 'job' ? [row.content] : [])),
    groups:              groupsOf(input, shownRows),
    selected:            selectedContentOf(input),
    machine:             RailModel.machineOf(fleetDocument),
  };
}

export const AgentsModel = {
  agentsContentOf,
  titleFiguresOf,
  agentsFragmentOf,
} as const;
