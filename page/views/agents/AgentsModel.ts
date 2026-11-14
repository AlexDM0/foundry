/**
 * What the Agents view shows of a fleet document: the top bar's status line, the two filters with their counts, the rows the filters
 * leave in the document's order, and the selected agent. The selection and the filters live in the route, so both survive a new document;
 * a value the forge did not report is `null` here and a dash on screen, never zero.
 */
import type { SegmentOption } from 'design-system/SegmentedControl';
import type { TagTone }       from 'design-system/Tag';

import type { FleetDocument, FleetDocumentFleetAgentRow, FleetDocumentForge } from '../../@types/FleetDocument.ts';
import type { DotRole }                                                       from '../../design-system/RoleDot.tsx';
import { ForgeContractUtil }                                                  from '../../shared/utils/ForgeContractUtil.ts';
import { HashRouter, type SelectedAgent }                                     from '../../shell/HashRouter.ts';
import { RailModel, type RailMachine }                                        from '../../shell/RailModel.ts';
import {
  type AgentConditionFilter,
  type AgentFilters,
  type AgentRoleFilter,
  AgentsFilters,
} from './AgentsFilters.ts';
import { AgentTextUtil } from './utils/AgentTextUtil.ts';

/** The rows this view draws are the jobs: a running brain's row counts against no limit and is not one of them. */
function jobRowsOf(fleetDocument: FleetDocument): FleetDocumentFleetAgentRow[] {
  return fleetDocument.agents.filter((row) => row.countsAgainstLimit);
}

export interface AgentFlag {
  readonly text: string;
  readonly tone: TagTone;
}

export type AgentMeterTone = 'neutral' | 'builder' | 'reviewer' | 'paused';

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
    readonly flags:         readonly AgentFlag[];
    readonly project:       string;
    readonly ticketIdsText: string | null;
    readonly ticketTitle:   string | null;
    readonly facts:         readonly AgentFact[];
    readonly lastLine:      string | null;
    readonly openHref:      string;
    readonly openLabel:     string;
  };

export interface AgentsContent {
  readonly agentCount:       number;
  readonly filters:          AgentFilters;
  readonly roleOptions:      readonly SegmentOption<AgentRoleFilter>[];
  readonly conditionOptions: readonly SegmentOption<AgentConditionFilter>[];
  readonly rows:             readonly AgentRowContent[];
  readonly selected:         SelectedAgentContent;
  /** This machine's agents against its limit, shown when no agent runs. */
  readonly machine:          RailMachine;
}

export interface AgentsModelInput {
  readonly fleetDocument:      FleetDocument;
  readonly selectedAgent:      SelectedAgent | null;
  readonly query:              string;
  /** The page's clock, for running times shown and never compared. */
  readonly readAtMilliseconds: number;
}

const AGENTS_ROUTE_OF_THE_BRIDGE = '#agents/';

const METER_TONE_OF_DOT_ROLE: Readonly<Partial<Record<DotRole, AgentMeterTone>>> = {
  builder:  'builder',
  reviewer: 'reviewer',
  waiting:  'paused',
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

function dotRoleOf(row: FleetDocumentFleetAgentRow): DotRole | null {
  if (row.waitingOnDecisionId !== null || AgentTextUtil.stateIsWaiting(row.state)) return 'waiting';
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
    runningText:   row.startedAt === null ? null : AgentTextUtil.runningTimeText(row.startedAt, readAtMilliseconds),
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

function factsOf(row: FleetDocumentFleetAgentRow): AgentFact[] {
  const callsText = row.calls === null ? null : `${row.calls}${row.callBudget === null ? '' : ` of ${row.callBudget}`}`;
  const facts: readonly (readonly [label: string, value: string | null])[] = [
    ['Turn', row.turn === null ? null : TURN_WORDS[row.turn]],
    ['Calls', callsText],
    ['Tool calls', row.toolCalls === null ? null : String(row.toolCalls)],
    ['Subagents', row.runningSubagents === null ? null : `${row.runningSubagents} running`],
    ['Messages waiting', row.messagesWaiting === null ? null : String(row.messagesWaiting)],
  ];
  return facts.flatMap(([label, value]) => (value === null ? [] : [{ label, value }]));
}

function selectedContentOf(input: AgentsModelInput): SelectedAgentContent {
  const { fleetDocument, selectedAgent } = input;
  if (selectedAgent === null) return { kind: 'none-selected' };
  const project = projectOf(fleetDocument, selectedAgent.trackerId);
  const row = jobRowsOf(fleetDocument).find((candidate) => isTheSelectedAgent(candidate, selectedAgent));
  if (row === undefined) return { kind: 'no-longer-running', jobId: selectedAgent.jobId, project };
  return {
    kind:          'running',
    jobId:         row.jobId,
    role:          row.role,
    flags:         flagsOf(row),
    project,
    ticketIdsText: ticketIdsTextOf(row),
    ticketTitle:   row.ticketTitle,
    facts:         factsOf(row),
    lastLine:      row.lastLine,
    openHref:      jobHrefOf(fleetDocument, row),
    openLabel:     `Open ${row.jobId} in its forge`,
  };
}

/** With no agent there is no forge or token to count, so the line says only that none works. */
function statusTextOf(fleetDocument: FleetDocument): string {
  const agents = jobRowsOf(fleetDocument);
  if (agents.length === 0) return '0 working';
  const forgeCount = new Set(agents.map((row) => row.trackerId)).size;
  const tokens = agents.reduce((sum, row) => sum + row.tokens, 0);
  const tokensText = `${AgentTextUtil.groupedNumberText(tokens)} ${tokens === 1 ? 'token' : 'tokens'} in flight`;
  return `${agents.length} working across ${AgentTextUtil.countedPhrase(forgeCount, 'forge', 'forges')} · ${tokensText}`;
}

/** Each filter counts the rows it would leave beside the other filter as it stands. */
function roleOptionsOf(fleetDocument: FleetDocument, condition: AgentConditionFilter): SegmentOption<AgentRoleFilter>[] {
  const rows = jobRowsOf(fleetDocument).filter((row) => AgentsFilters.rowPassesConditionFilter(row, condition));
  const countOf = (role: AgentRoleFilter) => rows.filter((row) => AgentsFilters.rowPassesRoleFilter(row, role)).length;
  return [
    { value: 'all', label: 'All', count: countOf('all') },
    { value: 'builders', label: 'Builders', count: countOf('builders') },
    { value: 'reviewers', label: 'Reviewers', count: countOf('reviewers') },
  ];
}

function conditionOptionsOf(fleetDocument: FleetDocument, role: AgentRoleFilter): SegmentOption<AgentConditionFilter>[] {
  const rows = jobRowsOf(fleetDocument).filter((row) => AgentsFilters.rowPassesRoleFilter(row, role));
  return [
    { value: 'every-agent', label: 'Every agent' },
    { value: 'needs-a-look', label: 'Needs a look', count: rows.filter((row) => AgentsFilters.agentNeedsALook(row)).length },
  ];
}

function agentsContentOf(input: AgentsModelInput): AgentsContent {
  const { fleetDocument, query } = input;
  const filters = AgentsFilters.filtersOf(query);
  return {
    agentCount:       jobRowsOf(fleetDocument).length,
    filters,
    roleOptions:      roleOptionsOf(fleetDocument, filters.condition),
    conditionOptions: conditionOptionsOf(fleetDocument, filters.role),
    rows:             jobRowsOf(fleetDocument).filter((row) => AgentsFilters.rowPassesFilters(row, filters)).map((row) => rowContentOf(input, filters, row)),
    selected:         selectedContentOf(input),
    machine:          RailModel.machineOf(fleetDocument),
  };
}

export const AgentsModel = {
  agentsContentOf,
  statusTextOf,
  agentsFragmentOf,
} as const;
