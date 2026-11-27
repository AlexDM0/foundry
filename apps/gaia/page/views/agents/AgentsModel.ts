/**
 * What the Agents view shows of a fleet document: the page title's figures, the two filters with their counts, the rows grouped by forge, and
 * the selected agent. The selection and the filters live in the route, so both survive a new document; an unreported value is `null`, never zero.
 */

import type { FleetDocument, FleetDocumentFleetAgentRow, FleetDocumentForge } from '../../@types/FleetDocument.ts';
import type { DotCondition }                                                  from '../../components/ConditionDot.tsx';
import type { DotRole }                                                       from '../../components/RoleDot.tsx';
import type { SegmentOption, TagTone }                                        from '../../lib/design-system/DesignSystemInterface.ts';
import type { PageFigure }                                                    from '../../shared/@types/ViewParts.ts';
import { HashRouter, type SelectedAgent }                                     from '../../shared/HashRouter.ts';
import { type MachineLoad, MachineLoadModel }                                 from '../../shared/MachineLoadModel.ts';
import { CountTextUtil }                                                      from '../../shared/utils/CountTextUtil.ts';
import { FleetDocumentUtil }                                                  from '../../shared/utils/FleetDocumentUtil.ts';
import { ForgeContractUtil }                                                  from '../../shared/utils/ForgeContractUtil.ts';
import { ForgeTextUtil }                                                      from '../../shared/utils/ForgeTextUtil.ts';
import {
  type AgentConditionFilter,
  type AgentFilters,
  type AgentRoleFilter,
  AgentsFilters,
} from './AgentsFilters.ts';
import { AgentTextUtil } from './utils/AgentTextUtil.ts';

/** The board's Agents tab, where the forge shows a job as its item. */
const AGENTS_TAB = 'agents';

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

/** A forge's head row over its agents: its condition, its agents against its limit, and what of it waits on User or holds its launches. */
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
  readonly rows:         readonly AgentRowContent[];
}

export interface AgentFact {
  readonly label: string;
  readonly value: string;
}

export type SelectedAgentContent =
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
  readonly agentCount:          number;
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
  readonly machine:             MachineLoad;
}

export interface AgentsModelInput {
  readonly fleetDocument:      FleetDocument;
  readonly selectedAgent:      SelectedAgent | null;
  readonly query:              string;
  /** The page's clock, for running times shown and never compared. */
  readonly readAtMilliseconds: number;
}

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

/** A tracker id the document holds no forge for stands in for its project. */
function projectOf(fleetDocument: FleetDocument, trackerId: string): string {
  return FleetDocumentUtil.forgeOf(fleetDocument, trackerId)?.project ?? trackerId;
}

/** The agent in its forge's own Agents view when the forge opens in place, else the forge's row on the Forges view. */
function jobHrefOf(fleetDocument: FleetDocument, row: FleetDocumentFleetAgentRow): string {
  const forge = FleetDocumentUtil.forgeOf(fleetDocument, row.trackerId);
  if (forge !== null && ForgeContractUtil.canOpenInPlace(forge)) {
    return HashRouter.servedBoardFragmentOf(row.trackerId, row.boardRoute ?? { tab: AGENTS_TAB, item: row.jobId });
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
    const sweepsText = row.silentSweeps === null ? '' : ` · ${CountTextUtil.countedPhrase(row.silentSweeps, 'sweep', 'sweeps')}`;
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
  const project = projectOf(fleetDocument, selectedAgent.trackerId);
  const row = fleetDocument.agents.find((candidate) => isTheSelectedAgent(candidate, selectedAgent));
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
  const agentCount = fleetDocument.agents.length;
  const { machineLimit } = fleetDocument.figures;
  return machineLimit === null ? String(agentCount) : `${agentCount} / ${machineLimit}`;
}

/** The page title's figures: the agents against the machine limit when one is known, their forges and their tokens. */
function titleFiguresOf(fleetDocument: FleetDocument): PageFigure[] {
  const { agents } = fleetDocument;
  const forgeCount = new Set(agents.map((row) => row.trackerId)).size;
  const tokens = agents.reduce((sum, row) => sum + row.tokens, 0);
  return [
    { value: machineAgentsFigureOf(fleetDocument), label: fleetDocument.figures.machineLimit === null && agents.length === 1 ? 'agent' : 'agents' },
    { value: String(forgeCount), label: forgeCount === 1 ? 'forge' : 'forges' },
    { value: AgentTextUtil.groupedNumberText(tokens), label: tokens === 1 ? 'token in flight' : 'tokens in flight' },
  ];
}

/** A held forge says so first, as its head's note in orange; then what of it waits on User. */
function groupNoteOf(forge: FleetDocumentForge): string | null {
  const waitingCount = FleetDocumentUtil.waitingCountOf(forge);
  const parts = [
    forge.condition === 'held' ? ForgeTextUtil.conditionWordInSentenceCaseOf(forge.condition) : null,
    waitingCount === null || waitingCount === 0 ? null : CountTextUtil.countedPhrase(waitingCount, 'waits on you', 'wait on you'),
  ];
  const shownParts = parts.filter((part) => part !== null);
  return shownParts.length === 0 ? null : shownParts.join(' · ');
}

/** The forge's own rows count against its limit, whatever the filters leave. */
function groupOf(input: AgentsModelInput, trackerId: string, rows: readonly AgentRowContent[]): AgentGroupContent {
  const { fleetDocument } = input;
  const forge = FleetDocumentUtil.forgeOf(fleetDocument, trackerId);
  const agentCount = fleetDocument.agents.filter((row) => row.trackerId === trackerId).length;
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
      label:  `${CountTextUtil.countedPhrase(agentCount, 'agent', 'agents')} against a limit of ${limit}`,
    },
    noteText: forge === null ? null : groupNoteOf(forge),
    rows,
  };
}

interface ShownRow {
  readonly trackerId: string;
  readonly content:   AgentRowContent;
}

/** The forges in the registry's order, then any forge the document no longer holds, in the order its rows come. */
function groupsOf(input: AgentsModelInput, rows: readonly ShownRow[]): AgentGroupContent[] {
  const { fleetDocument } = input;
  const trackerIds = [...new Set([...fleetDocument.forges.map((forge) => forge.trackerId), ...rows.map((row) => row.trackerId)])];
  return trackerIds.flatMap((trackerId) => {
    const forgeRows = rows.filter((row) => row.trackerId === trackerId).map((row) => row.content);
    return forgeRows.length === 0 ? [] : [groupOf(input, trackerId, forgeRows)];
  });
}

/** Each filter counts the rows it would leave beside the other filter as it stands. */
function roleOptionsOf(fleetDocument: FleetDocument, filters: AgentFilters): SegmentOption<AgentRoleFilter>[] {
  const rows = fleetDocument.agents.filter((row) => AgentsFilters.rowPassesConditionFilter(row, filters.condition));
  const countOf = (role: AgentRoleFilter) => rows.filter((row) => AgentsFilters.rowPassesRoleFilter(row, role)).length;
  return [
    { value: 'all', label: 'All', count: countOf('all') },
    { value: 'builders', label: 'Builders', count: countOf('builders') },
    { value: 'reviewers', label: 'Reviewers', count: countOf('reviewers') },
  ];
}

function conditionOptionsOf(fleetDocument: FleetDocument, role: AgentRoleFilter): SegmentOption<AgentConditionFilter>[] {
  const rows = fleetDocument.agents.filter((row) => AgentsFilters.rowPassesRoleFilter(row, role));
  return [
    { value: 'every-agent', label: 'Every agent' },
    { value: 'needs-a-look', label: 'Needs a look', count: rows.filter((row) => AgentsFilters.agentNeedsALook(row)).length },
  ];
}

function agentsContentOf(input: AgentsModelInput): AgentsContent {
  const { fleetDocument, query } = input;
  const filters = AgentsFilters.filtersOf(query);
  const shownRows = fleetDocument.agents
    .filter((row) => AgentsFilters.rowPassesFilters(row, filters))
    .map((row): ShownRow => ({ trackerId: row.trackerId, content: rowContentOf(input, filters, row) }));
  return {
    agentCount:          fleetDocument.agents.length,
    machineAgentsFigure: machineAgentsFigureOf(fleetDocument),
    filters,
    roleOptions:         roleOptionsOf(fleetDocument, filters),
    conditionOptions:    conditionOptionsOf(fleetDocument, filters.role),
    rows:                shownRows.map((row) => row.content),
    groups:              groupsOf(input, shownRows),
    selected:            selectedContentOf(input),
    machine:             MachineLoadModel.machineLoadOf(fleetDocument),
  };
}

export const AgentsModel = {
  agentsContentOf,
  titleFiguresOf,
  agentsFragmentOf,
} as const;
