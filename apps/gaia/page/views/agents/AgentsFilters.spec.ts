/**
 * The Agents view's filters. What matters: they round-trip through the route's query, so a link or a reload keeps them; no filter is no
 * parameter; a value the view does not know reads as no filter rather than as an empty table; and "Needs a look" keeps exactly what the
 * forge itself flags, a quiet agent or one waiting on a decision, with an unreported verdict never counting as one; and Flint's brain has a
 * role filter of its own, which keeps its row and no job.
 */
import { describe, expect, test } from 'bun:test';

import type { FleetDocumentAgentRow }                         from '../../@types/FleetDocument.ts';
import { FLEET_FIVE_FORGES }                                  from '../../testing/fixtures/fleet-five-forges.ts';
import { type AgentFilters, AgentsFilters, NO_AGENT_FILTERS } from './AgentsFilters.ts';

const BUILDER = FLEET_FIVE_FORGES.agents.find((row) => row.role === 'builder' && row.quiet === false && row.waitingOnDecisionId === null) as FleetDocumentAgentRow;

describe('the filters in the route\'s query', () => {
  test('every pair of filters is written to a query and read back as itself', () => {
    const everyPair: AgentFilters[] = (['all', 'builders', 'reviewers', 'brain'] as const).flatMap((role) => (
      (['every-agent', 'needs-a-look'] as const).map((condition) => ({ role, condition }))
    ));
    expect(everyPair.map((filters) => AgentsFilters.filtersOf(AgentsFilters.queryOf(filters)))).toEqual(everyPair);
  });

  test('no filter is written as no parameter, and a filter as its own', () => {
    expect(AgentsFilters.queryOf(NO_AGENT_FILTERS)).toBe('');
    expect(AgentsFilters.queryOf({ role: 'reviewers', condition: 'needs-a-look' })).toBe('role=reviewers&condition=needs-a-look');
  });

  test('a value the view does not know, or no query at all, reads as no filter', () => {
    expect(AgentsFilters.filtersOf('role=gardeners&condition=sleepy')).toEqual(NO_AGENT_FILTERS);
    expect(AgentsFilters.filtersOf('')).toEqual(NO_AGENT_FILTERS);
  });
});

describe('which rows a filter keeps', () => {
  test('"Needs a look" keeps a quiet agent and one waiting on a decision, and no other', () => {
    expect(AgentsFilters.agentNeedsALook({ ...BUILDER, quiet: true })).toBe(true);
    expect(AgentsFilters.agentNeedsALook({ ...BUILDER, waitingOnDecisionId: 'E7' })).toBe(true);
    expect(AgentsFilters.agentNeedsALook(BUILDER)).toBe(false);
  });

  test('an agent whose forge reports no quiet verdict is not counted as quiet', () => {
    expect(AgentsFilters.agentNeedsALook({ ...BUILDER, quiet: null, silentSweeps: null })).toBe(false);
  });

  test('a role filter keeps its own role only, and an agent with no role passes only All', () => {
    const noRole = { ...BUILDER, role: null };
    expect(['all', 'builders', 'reviewers', 'brain'].map((role) => AgentsFilters.rowPassesRoleFilter(BUILDER, role as AgentFilters['role']))).toEqual([true, true, false, false]);
    expect(['all', 'builders', 'reviewers', 'brain'].map((role) => AgentsFilters.rowPassesRoleFilter(noRole, role as AgentFilters['role']))).toEqual([true, false, false, false]);
  });

  test('the brain filter keeps Flint\'s brain\'s row, which All keeps too, and which never needs a look', () => {
    const brainRow = FLEET_FIVE_FORGES.agents.find((row) => row.role === 'brain') as FleetDocumentAgentRow;
    expect(['all', 'builders', 'reviewers', 'brain'].map((role) => AgentsFilters.rowPassesRoleFilter(brainRow, role as AgentFilters['role']))).toEqual([true, false, false, true]);
    expect(AgentsFilters.agentNeedsALook(brainRow)).toBe(false);
  });

  test('both filters must keep a row', () => {
    const quietReviewer = { ...BUILDER, role: 'reviewer', quiet: true };
    expect(AgentsFilters.rowPassesFilters(quietReviewer, { role: 'reviewers', condition: 'needs-a-look' })).toBe(true);
    expect(AgentsFilters.rowPassesFilters(quietReviewer, { role: 'builders', condition: 'needs-a-look' })).toBe(false);
    expect(AgentsFilters.rowPassesFilters(BUILDER, { role: 'builders', condition: 'needs-a-look' })).toBe(false);
  });
});
