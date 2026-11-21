/**
 * What the Agents view shows of a fleet document (SCREENS A2). What matters: the status line counts the document's job rows, forges and
 * tokens (821,300 for `fleet-five-forges`), and a running brain only in its own figure (its row: `AgentsModel.brain.spec.ts`); each
 * filter's count is what pressing it would leave; "Needs a look" leaves exactly the rows the forge flags; the rows stand under their
 * forges in the registry's order, each forge counting its own job rows against its limit and saying what of it waits on User; a Calls
 * meter exists only beside a budget; a `counts-only` forge's row holds `null` wherever its summary is silent; the selection, kept in the
 * route, survives a new document and turns into "no longer running" when its job ends; and every link goes where SCREENS says, keeping the
 * filters.
 */
import { describe, expect, test } from 'bun:test';

import type { FleetDocument, FleetDocumentFleetAgentRow }                           from '../../@types/FleetDocument.ts';
import type { CommandStates }                                                       from '../../api/CommandSender.ts';
import { FLEET_DEGRADED }                                                           from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_EMPTY }                                                              from '../../testing/fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from '../../testing/fixtures/fleet-five-forges.ts';
import { type AgentRowContent, AgentsModel, type AgentsModelInput }                 from './AgentsModel.ts';

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;
const READ_AT_MILLISECONDS = Date.parse(FLEET_FIXTURES_READ_AT);

const J12_OF_INVOICE_SERVICE = { trackerId: TRACKER_IDS.invoiceService, jobId: 'J12' };

const NO_COMMAND_STATES: CommandStates = { forges: new Map(), fleet: new Map(), fleetAnswers: new Map() };

function contentOf(fleetDocument: FleetDocument, overrides: Partial<Omit<AgentsModelInput, 'fleetDocument'>> = {}) {
  return AgentsModel.agentsContentOf({
    fleetDocument,
    selectedAgent:      null,
    query:              '',
    readAtMilliseconds: READ_AT_MILLISECONDS,
    timeZone:           'UTC',
    commandStates:      NO_COMMAND_STATES,
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

function withoutTheBrain(fleetDocument: FleetDocument): FleetDocument {
  return { ...fleetDocument, agents: fleetDocument.agents.filter((row) => row.countsAgainstLimit) };
}

function titleFiguresTextOf(fleetDocument: FleetDocument): string[] {
  return AgentsModel.titleFiguresOf(fleetDocument).map((figure) => `${figure.value} ${figure.label}`);
}

describe('the page title\'s figures and the filters\' counts', () => {
  test('with fleet-five-forges the figures count ten agents of the twelve the machine allows, across four forges, with 821,300 tokens, and the brain outside the limit', () => {
    expect(titleFiguresTextOf(FLEET_FIVE_FORGES)).toEqual(['10 / 12 agents', '4 forges', '821,300 tokens in flight', '1 brain, outside the limit']);
  });

  test('with no brain running there is no brain figure', () => {
    expect(titleFiguresTextOf(withoutTheBrain(FLEET_FIVE_FORGES))).toEqual(['10 / 12 agents', '4 forges', '821,300 tokens in flight']);
  });

  test('one agent on one forge is counted in the singular, and with no limit known the agents stand alone', () => {
    const [onlyRow] = FLEET_FIVE_FORGES.agents;
    const oneAgent = {
      ...FLEET_FIVE_FORGES,
      agents:  onlyRow === undefined ? [] : [{ ...onlyRow, tokens: 1 }],
      figures: { ...FLEET_FIVE_FORGES.figures, machineLimit: null },
    };
    expect(titleFiguresTextOf(oneAgent)).toEqual(['1 agent', '1 forge', '1 token in flight']);
  });

  test('the role filter counts All 11 with the brain, Builders 7, Reviewers 3, Flint\'s brain 1, and the condition filter Needs a look 2, as A2 shows', () => {
    const content = contentOf(FLEET_FIVE_FORGES);
    expect(content.roleOptions.map((option) => [option.label, option.count])).toEqual([['All', 11], ['Builders', 7], ['Reviewers', 3], ['Flint\'s brain', 1]]);
    expect(content.conditionOptions.map((option) => [option.label, option.count])).toEqual([['Every agent', undefined], ['Needs a look', 2]]);
  });

  test('each filter counts what it would leave beside the other filter as it stands', () => {
    const content = contentOf(FLEET_FIVE_FORGES, { query: 'role=reviewers&condition=needs-a-look' });
    expect(content.roleOptions.map((option) => option.count)).toEqual([2, 2, 0, 0]);
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

describe('the forges\' groups', () => {
  test('the rows stand under their forges in the registry\'s order, each forge with its condition, its agents against its limit and its note', () => {
    const { groups } = contentOf(FLEET_FIVE_FORGES);
    expect(groups.map((group) => [group.project, group.condition, group.agentsFigure, group.agentsWord, group.noteText, group.rows.map((row) => row.jobId)])).toEqual([
      ['Example Storefront', 'live', '4 / 5', 'agents', '2 wait on you', ['J2', 'J3', 'J4', 'J6']],
      ['Invoice Service', 'live', '3 / 5', 'agents', '2 wait on you', ['J11', 'J12', 'J14']],
      ['Research Wiki', 'live', '1 / 3', 'agents', '1 waits on you', ['J2']],
      ['Example Mobile App', 'held', '2 / 2', 'agents', 'Launches held', ['J5', 'J7']],
    ]);
    expect(groups[0]?.slots).toEqual({ filled: 4, limit: 5, label: '4 agents against a limit of 5' });
  });

  test('a running brain is in no group\'s count, and a filter hides a forge it leaves no row of but not its count', () => {
    const { groups } = contentOf(FLEET_FIVE_FORGES, { query: 'condition=needs-a-look' });
    expect(groups.map((group) => [group.project, group.agentsFigure, group.rows.map((row) => row.jobId)])).toEqual([
      ['Example Storefront', '4 / 5', ['J3']],
      ['Invoice Service', '3 / 5', ['J12']],
    ]);
  });

  test('a forge that reports no limit counts its agents alone and has no slots, and one the document no longer holds is named by its tracker', () => {
    const noLimit = {
      ...FLEET_FIVE_FORGES,
      forges: FLEET_FIVE_FORGES.forges.flatMap((forge) => {
        if (forge.trackerId === TRACKER_IDS.invoiceService) return [];
        return forge.trackerId === TRACKER_IDS.researchWiki ? [{ ...forge, concurrency: null }] : [forge];
      }),
    };
    const { groups } = contentOf(noLimit);
    const wiki = groups.find((group) => group.trackerId === TRACKER_IDS.researchWiki);
    expect([wiki?.agentsFigure, wiki?.agentsWord, wiki?.slots]).toEqual(['1', 'agent', null]);
    const gone = groups.at(-1);
    expect([gone?.trackerId, gone?.project, gone?.condition, gone?.noteText]).toEqual([TRACKER_IDS.invoiceService, TRACKER_IDS.invoiceService, null, null]);
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

  test('an agent waiting on User\'s decision takes the orange asking dot and meter, and one waiting on anything else the grey ones', () => {
    const row = rowOf(rows, 'Example Storefront', 'J3');
    expect([row.dotRole, row.stateText, row.calls?.meter?.tone]).toEqual(['needs-user', 'Waiting', 'asks']);
    const waitingOnNothingOfUser = {
      ...FLEET_FIVE_FORGES,
      agents: FLEET_FIVE_FORGES.agents.map((agent) => (agent.jobId === 'J3' ? { ...agent, waitingOnDecisionId: null } : agent)),
    };
    const waiting = rowOf(contentOf(waitingOnNothingOfUser).rows, 'Example Storefront', 'J3');
    expect([waiting.dotRole, waiting.stateText, waiting.calls?.meter?.tone]).toEqual(['waiting', 'Waiting', 'paused']);
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
    expect(rowOf(contentOf(FLEET_FIVE_FORGES).rows, 'Invoice Service', 'J12').jobHref).toBe(`#forge/${TRACKER_IDS.invoiceService}/agents/J12`);
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
      dotRole:       'builder',
      stateText:     'Building',
      runningText:   '34m 02s',
      flags:         [{ text: 'quiet · 4 sweeps', tone: 'neutral' }],
      project:       'Invoice Service',
      ticketIdsText: '#034',
      ticketTitle:   'Credit note numbering',
      calls:         {
        text:  '58 / 120',
        meter: {
          used: 58, whole: 120, label: '58 of 120 calls', tone: 'builder'
        }
      },
      tokensText:   '122,300',
      lastToolCall: 'Bash bun test ./src/features/credit-notes',
      facts:        [
        { label: 'Turn', value: 'Mid-turn' },
        { label: 'Calls', value: '58 of 120' },
        { label: 'Tool calls', value: '143' },
        { label: 'Subagents', value: '1 running' },
        { label: 'Messages waiting', value: '0' },
      ],
      lastLine:  'Running the numbering specs again after the change to CreditNoteSequence.ts.\n$ bun test ./src/features/credit-notes',
      openHref:  `#forge/${TRACKER_IDS.invoiceService}/agents/J12`,
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

  test('an agent that runs no subagent says none, in words', () => {
    const content = contentOf(FLEET_FIVE_FORGES, { selectedAgent: { trackerId: TRACKER_IDS.exampleStorefront, jobId: 'J4' } });
    expect(content.selected.kind === 'running' ? content.selected.facts.find((fact) => fact.label === 'Subagents') : null).toEqual({ label: 'Subagents', value: 'none' });
  });

  test('a counts-only agent\'s panel lists only the facts its summary holds', () => {
    const content = contentOf(FLEET_DEGRADED, { selectedAgent: { trackerId: TRACKER_IDS.researchWiki, jobId: 'J2' } });
    expect(content.selected.kind === 'running' ? [content.selected.facts, content.selected.lastLine] : null).toEqual([[], null]);
  });
});

describe('no agent', () => {
  test('with fleet-empty there is no row, the figures count none, and the machine shows its agents with no limit known', () => {
    const content = contentOf(FLEET_EMPTY);
    expect(titleFiguresTextOf(FLEET_EMPTY)).toEqual(['0 agents', '0 forges', '0 tokens in flight']);
    expect([content.agentCount, content.rows, content.groups]).toEqual([0, [], []]);
    expect(content.machine).toEqual({
      agentsText:     '0',
      meter:          { filled: 0, slots: 12, label: '0 agents, no limit known' },
      atTheLimitLine: null,
      limitLine:      'no limit known · 12 CPUs',
      isAtTheLimit:   false,
    });
  });
});
