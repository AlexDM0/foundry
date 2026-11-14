/**
 * What the Agents view shows of a fleet document (SCREENS A2). What matters: the status line counts the document's job rows, forges and
 * tokens (821,300 for `fleet-five-forges`), and a running brain's row is not drawn among them; each filter's count is what pressing it
 * would leave; "Needs a look" leaves exactly the rows the forge flags; a Calls meter exists only beside a budget; a `counts-only` forge's
 * row holds `null` wherever its summary is silent; the selection, kept in the route, survives a new document and turns into "no longer
 * running" when its job ends; and every link goes where SCREENS says, keeping the filters.
 */
import { describe, expect, test } from 'bun:test';

import type { FleetDocument, FleetDocumentFleetAgentRow }                           from '../../@types/FleetDocument.ts';
import { FLEET_DEGRADED }                                                           from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_EMPTY }                                                              from '../../testing/fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from '../../testing/fixtures/fleet-five-forges.ts';
import { type AgentRowContent, AgentsModel, type AgentsModelInput }                 from './AgentsModel.ts';

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;
const READ_AT_MILLISECONDS = Date.parse(FLEET_FIXTURES_READ_AT);

const J12_OF_INVOICE_SERVICE = { trackerId: TRACKER_IDS.invoiceService, jobId: 'J12' };

function contentOf(fleetDocument: FleetDocument, overrides: Partial<Omit<AgentsModelInput, 'fleetDocument'>> = {}) {
  return AgentsModel.agentsContentOf({
    fleetDocument,
    selectedAgent:      null,
    query:              '',
    readAtMilliseconds: READ_AT_MILLISECONDS,
    ...overrides,
  });
}

function rowOf(rows: readonly AgentRowContent[], project: string, jobId: string): AgentRowContent {
  const row = rows.find((candidate) => candidate.project === project && candidate.jobId === jobId);
  if (row === undefined) throw new Error(`No row for ${project} ${jobId}.`);
  return row;
}

function withoutJob(fleetDocument: FleetDocument, trackerId: string, jobId: string): FleetDocument {
  return { ...fleetDocument, agents: fleetDocument.agents.filter((row) => !(row.trackerId === trackerId && row.jobId === jobId)) };
}

describe('the status line and the filters\' counts', () => {
  test('with fleet-five-forges the status line counts ten agents across four forges and 821,300 tokens', () => {
    expect(AgentsModel.statusTextOf(FLEET_FIVE_FORGES)).toBe('10 working across 4 forges · 821,300 tokens in flight');
  });

  test('one agent on one forge is counted in the singular', () => {
    const [onlyRow] = FLEET_FIVE_FORGES.agents;
    const oneAgent = { ...FLEET_FIVE_FORGES, agents: onlyRow === undefined ? [] : [{ ...onlyRow, tokens: 1 }] };
    expect(AgentsModel.statusTextOf(oneAgent)).toBe('1 working across 1 forge · 1 token in flight');
  });

  test('the role filter counts All 10, Builders 7, Reviewers 3, and the condition filter Needs a look 2, as A2 shows', () => {
    const content = contentOf(FLEET_FIVE_FORGES);
    expect(content.roleOptions.map((option) => [option.label, option.count])).toEqual([['All', 10], ['Builders', 7], ['Reviewers', 3]]);
    expect(content.conditionOptions.map((option) => [option.label, option.count])).toEqual([['Every agent', undefined], ['Needs a look', 2]]);
  });

  test('each filter counts what it would leave beside the other filter as it stands', () => {
    const content = contentOf(FLEET_FIVE_FORGES, { query: 'role=reviewers&condition=needs-a-look' });
    expect(content.roleOptions.map((option) => option.count)).toEqual([2, 2, 0]);
    expect(content.conditionOptions.map((option) => option.count)).toEqual([undefined, 0]);
  });
});

describe('the rows the filters leave', () => {
  test('with no filter the rows are the document\'s ten job rows, in the document\'s order, and not its running brain\'s', () => {
    const content = contentOf(FLEET_FIVE_FORGES);
    const jobRows = FLEET_FIVE_FORGES.agents.filter((row) => row.countsAgainstLimit);
    expect(content.rows.map((row) => row.key)).toEqual(jobRows.map((row) => `${row.trackerId}/${row.jobId}`));
    expect(jobRows).toHaveLength(FLEET_FIVE_FORGES.agents.length - 1);
  });

  test('"Needs a look" leaves exactly the agent waiting on E2 and the quiet one', () => {
    const { rows } = contentOf(FLEET_FIVE_FORGES, { query: 'condition=needs-a-look' });
    expect(rows.map((row) => [row.project, row.jobId, row.flags])).toEqual([
      ['Example Storefront', 'J3', [{ text: 'asks you · E2', tone: 'warn' }]],
      ['Invoice Service', 'J12', [{ text: 'quiet · 4 sweeps', tone: 'neutral' }]],
    ]);
  });

  test('Builders leaves the seven builders, and Reviewers the three reviewers', () => {
    expect(contentOf(FLEET_FIVE_FORGES, { query: 'role=builders' }).rows.map((row) => row.role)).toEqual(Array.from({ length: 7 }, () => 'builder'));
    expect(contentOf(FLEET_FIVE_FORGES, { query: 'role=reviewers' }).rows.map((row) => row.role)).toEqual(['reviewer', 'reviewer', 'reviewer']);
  });
});

describe('one row', () => {
  const { rows } = contentOf(FLEET_FIVE_FORGES);

  test('a building agent shows its role\'s dot, its calls against its budget with a meter in its role\'s tone, and its running time', () => {
    const row = rowOf(rows, 'Invoice Service', 'J12');
    expect([row.dotRole, row.stateText, row.runningText, row.tokensText, row.ticketIdsText, row.ticketTitle]).toEqual([
      'builder', 'Building', '34m 02s', '122,300', '#034', 'Credit note numbering',
    ]);
    expect(row.calls).toEqual({
      text:  '58 / 120',
      meter: {
        used: 58, whole: 120, label: '58 of 120 calls', tone: 'builder'
      }
    });
  });

  test('an agent waiting on a decision takes the waiting dot and the paused meter', () => {
    const row = rowOf(rows, 'Example Storefront', 'J3');
    expect([row.dotRole, row.stateText, row.calls?.meter?.tone]).toEqual(['waiting', 'Waiting', 'paused']);
  });

  test('the Calls meter is absent, not empty, when the forge reports no call budget', () => {
    const fleetDocument = { ...FLEET_FIVE_FORGES, agents: FLEET_FIVE_FORGES.agents.map((row) => ({ ...row, callBudget: null })) };
    const row = rowOf(contentOf(fleetDocument).rows, 'Invoice Service', 'J12');
    expect(row.calls).toEqual({ text: '58', meter: null });
  });

  test('a quiet agent whose forge counts no sweeps is flagged quiet alone, never with a guessed count', () => {
    const fleetDocument = { ...FLEET_FIVE_FORGES, agents: FLEET_FIVE_FORGES.agents.map((row) => ({ ...row, silentSweeps: null })) };
    expect(rowOf(contentOf(fleetDocument).rows, 'Invoice Service', 'J12').flags).toEqual([{ text: 'quiet', tone: 'neutral' }]);
  });

  test('a counts-only forge\'s row keeps id, role, tickets, state and tokens, and holds nothing for the rest', () => {
    const row = rowOf(contentOf(FLEET_DEGRADED).rows, 'Research Wiki', 'J2');
    expect([row.jobId, row.role, row.ticketIdsText, row.stateText, row.tokensText]).toEqual(['J2', 'builder', '#007', 'Building', '103,490']);
    expect([row.ticketTitle, row.runningText, row.calls, row.lastToolCall, row.flags]).toEqual([null, null, null, null, []]);
  });
});

describe('where the links go', () => {
  test('a row selects itself on the Agents route, keeping the filters in the query', () => {
    const row = rowOf(contentOf(FLEET_FIVE_FORGES, { query: 'role=builders' }).rows, 'Invoice Service', 'J12');
    expect(row.selectHref).toBe(`#agents/${TRACKER_IDS.invoiceService}/J12?role=builders`);
    expect(row.selectLabel).toBe('Invoice Service, J12');
  });

  test('the job link opens the agent in its forge in place, at the Bridge\'s own agent route', () => {
    expect(rowOf(contentOf(FLEET_FIVE_FORGES).rows, 'Invoice Service', 'J12').jobHref).toBe(`#forge/${TRACKER_IDS.invoiceService}/#agents/J12`);
  });

  test('a forge that cannot open in place sends the job link to its row on the Forges view', () => {
    const row = rowOf(contentOf(FLEET_DEGRADED).rows, 'Research Wiki', 'J2');
    expect(row.jobHref).toBe(`#forges?forge=${TRACKER_IDS.researchWiki}`);
  });

  test('a filter change keeps the selected agent and writes no parameter for no filter', () => {
    const needingALook = AgentsModel.agentsFragmentOf(J12_OF_INVOICE_SERVICE, { role: 'all', condition: 'needs-a-look' });
    expect(needingALook).toBe(`#agents/${TRACKER_IDS.invoiceService}/J12?condition=needs-a-look`);
    expect(AgentsModel.agentsFragmentOf(null, { role: 'all', condition: 'every-agent' })).toBe('#agents');
  });
});

describe('the selected agent', () => {
  test('with no agent selected the panel asks for one and no row is selected', () => {
    const content = contentOf(FLEET_FIVE_FORGES);
    expect(content.selected).toEqual({ kind: 'none-selected' });
    expect(content.rows.filter((row) => row.isSelected)).toEqual([]);
  });

  test('the selected agent\'s row is marked and its panel holds what its forge reports', () => {
    const content = contentOf(FLEET_FIVE_FORGES, { selectedAgent: J12_OF_INVOICE_SERVICE });
    expect(content.rows.filter((row) => row.isSelected).map((row) => row.key)).toEqual([`${TRACKER_IDS.invoiceService}/J12`]);
    expect(content.selected).toEqual({
      kind:          'running',
      jobId:         'J12',
      role:          'builder',
      flags:         [{ text: 'quiet · 4 sweeps', tone: 'neutral' }],
      project:       'Invoice Service',
      ticketIdsText: '#034',
      ticketTitle:   'Credit note numbering',
      facts:         [
        { label: 'Turn', value: 'Mid-turn' },
        { label: 'Calls', value: '58 of 120' },
        { label: 'Tool calls', value: '143' },
        { label: 'Subagents', value: '1 running' },
        { label: 'Messages waiting', value: '0' },
      ],
      lastLine:  'Running the numbering specs again after the change to CreditNoteSequence.ts.\n$ bun test ./src/features/credit-notes',
      openHref:  `#forge/${TRACKER_IDS.invoiceService}/#agents/J12`,
      openLabel: 'Open J12 in its forge',
    });
  });

  test('the selection survives a new document, which brings the agent\'s new figures', () => {
    const isJ12 = (row: FleetDocumentFleetAgentRow): boolean => row.trackerId === TRACKER_IDS.invoiceService && row.jobId === 'J12';
    const nextDocument = {
      ...FLEET_FIVE_FORGES,
      agents: FLEET_FIVE_FORGES.agents.map((row) => (isJ12(row) ? { ...row, calls: 59, turn: 'between-turns' as const } : row)),
    };
    const content = contentOf(nextDocument, { selectedAgent: J12_OF_INVOICE_SERVICE });
    expect(content.rows.filter((row) => row.isSelected).map((row) => row.calls?.text)).toEqual(['59 / 120']);
    expect(content.selected.kind === 'running' ? content.selected.facts.slice(0, 2) : null).toEqual([
      { label: 'Turn', value: 'Between turns' },
      { label: 'Calls', value: '59 of 120' },
    ]);
  });

  test('when the selected agent\'s job ends, the panel says it is no longer running and no row is selected', () => {
    const content = contentOf(withoutJob(FLEET_FIVE_FORGES, TRACKER_IDS.invoiceService, 'J12'), { selectedAgent: J12_OF_INVOICE_SERVICE });
    expect(content.selected).toEqual({ kind: 'no-longer-running', jobId: 'J12', project: 'Invoice Service' });
    expect(content.rows.filter((row) => row.isSelected)).toEqual([]);
  });

  test('a job of the same id on another forge is not the selected agent', () => {
    const content = contentOf(FLEET_FIVE_FORGES, { selectedAgent: { trackerId: TRACKER_IDS.researchWiki, jobId: 'J2' } });
    expect(content.rows.filter((row) => row.isSelected).map((row) => row.project)).toEqual(['Research Wiki']);
  });

  test('a selected agent hidden by the filters keeps its panel', () => {
    const content = contentOf(FLEET_FIVE_FORGES, { selectedAgent: J12_OF_INVOICE_SERVICE, query: 'role=reviewers' });
    expect(content.rows.some((row) => row.jobId === 'J12')).toBe(false);
    expect(content.selected.kind).toBe('running');
  });

  test('a counts-only agent\'s panel lists only the facts its summary holds', () => {
    const content = contentOf(FLEET_DEGRADED, { selectedAgent: { trackerId: TRACKER_IDS.researchWiki, jobId: 'J2' } });
    expect(content.selected.kind === 'running' ? [content.selected.facts, content.selected.lastLine] : null).toEqual([[], null]);
  });
});

describe('no agent', () => {
  test('with fleet-empty there is no row, the status line counts none, and the machine shows its agents with no limit known', () => {
    const content = contentOf(FLEET_EMPTY);
    expect(AgentsModel.statusTextOf(FLEET_EMPTY)).toBe('0 working');
    expect([content.agentCount, content.rows]).toEqual([0, []]);
    expect(content.machine).toEqual({
      agentsText: '0', meter: null, limitLine: 'no limit known · 12 CPUs', isAtTheLimit: false
    });
  });
});
