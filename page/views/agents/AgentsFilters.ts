/**
 * The Agents view's two filters, kept in the route's query so a link and a reload keep them: the role (`role=builders`) and the condition
 * (`condition=needs-a-look`). A value the view does not know reads as no filter, and no filter is written as no parameter.
 */
import type { FleetDocumentAgentRow } from '../../@types/FleetDocument.ts';

export type AgentRoleFilter = 'all' | 'builders' | 'reviewers';

export type AgentConditionFilter = 'every-agent' | 'needs-a-look';

export interface AgentFilters {
  readonly role:      AgentRoleFilter;
  readonly condition: AgentConditionFilter;
}

export const NO_AGENT_FILTERS: AgentFilters = { role: 'all', condition: 'every-agent' };

const ROLE_PARAMETER = 'role';
const CONDITION_PARAMETER = 'condition';

/** The forge's role each role filter keeps. */
const ROLE_OF_ROLE_FILTER: Readonly<Record<Exclude<AgentRoleFilter, 'all'>, string>> = {
  builders:  'builder',
  reviewers: 'reviewer',
};

function roleFilterOf(value: string | null): AgentRoleFilter {
  return value === 'builders' || value === 'reviewers' ? value : NO_AGENT_FILTERS.role;
}

function conditionFilterOf(value: string | null): AgentConditionFilter {
  return value === 'needs-a-look' ? value : NO_AGENT_FILTERS.condition;
}

function filtersOf(query: string): AgentFilters {
  const parameters = new URLSearchParams(query);
  return { role: roleFilterOf(parameters.get(ROLE_PARAMETER)), condition: conditionFilterOf(parameters.get(CONDITION_PARAMETER)) };
}

function queryOf(filters: AgentFilters): string {
  const parameters = new URLSearchParams();
  if (filters.role !== NO_AGENT_FILTERS.role) parameters.set(ROLE_PARAMETER, filters.role);
  if (filters.condition !== NO_AGENT_FILTERS.condition) parameters.set(CONDITION_PARAMETER, filters.condition);
  return parameters.toString();
}

/** The forge's own verdicts decide: it calls the agent quiet, or the agent waits on a decision. Gaia judges nothing itself. */
function agentNeedsALook(row: FleetDocumentAgentRow): boolean {
  return row.quiet === true || row.waitingOnDecisionId !== null;
}

function rowPassesRoleFilter(row: FleetDocumentAgentRow, role: AgentRoleFilter): boolean {
  return role === 'all' || row.role === ROLE_OF_ROLE_FILTER[role];
}

function rowPassesConditionFilter(row: FleetDocumentAgentRow, condition: AgentConditionFilter): boolean {
  return condition === 'every-agent' || agentNeedsALook(row);
}

function rowPassesFilters(row: FleetDocumentAgentRow, filters: AgentFilters): boolean {
  return rowPassesRoleFilter(row, filters.role) && rowPassesConditionFilter(row, filters.condition);
}

export const AgentsFilters = {
  filtersOf,
  queryOf,
  agentNeedsALook,
  rowPassesRoleFilter,
  rowPassesConditionFilter,
  rowPassesFilters,
} as const;
