/**
 * The Agents view's markup (SCREENS A2), unfolded without a document. What matters: with `fleet-five-forges` the table holds A2's ten rows
 * cell for cell under their forges' heads; "Needs a look" leaves the two rows the forge flags; the Calls cell holds no meter when there is
 * no budget; a `counts-only` forge's row shows a dash where its summary is silent; the selected row is marked and its panel survives a new
 * document or says the agent is no longer running; with no agent the view says so beside the machine meter; a filter press hands the
 * view's caller the new filters; and the view holds no control that would message or stop an agent, and says so.
 */
import { describe, expect, test } from 'bun:test';

import type { FleetDocument }                                                       from '../../@types/FleetDocument.ts';
import { type HostElement, ReactElementTree }                                       from '../../testing/ReactElementTree.ts';
import { FLEET_DEGRADED }                                                           from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_EMPTY }                                                              from '../../testing/fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from '../../testing/fixtures/fleet-five-forges.ts';
import type { AgentFilters }                                                        from './AgentsFilters.ts';
import { AgentsModel, type AgentsModelInput }                                       from './AgentsModel.ts';
import { AgentsView }                                                               from './AgentsView.tsx';

const tree = ReactElementTree;

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

const J12_OF_INVOICE_SERVICE = { trackerId: TRACKER_IDS.invoiceService, jobId: 'J12' };

/**
 * A2's groups as the artboard's example data writes them (designs/Agents.dc.html): each forge's head, then its rows, the forges in the
 * registry's order and the jobs in the document's. Each row is its cells' text: job with its role and running time, ticket with its last
 * tool call, state with its flag, calls, tokens. Example Mobile App's limit is the fixture's 2, where the artboard draws 4. Retake it from
 * the artboard's script when the artboard changes.
 */
const ARTBOARD_GROUPS = [
  ['Example Storefront4 / 5agents2 wait on you', [
    ['J2builder12m 04s', '#012 Checkout address formEdit src/checkout/AddressForm.tsx', 'Building', '41 / 120', '84,210'],
    ['J3builder9m 40s', '#014 Password reset flowBash forge ask', 'Waitingasks you · E2', '22 / 120', '51,900'],
    ['J4builder3m 10s', '#013 Product image zoomRead src/product/Gallery.tsx', 'Building', '9 / 120', '18,400'],
    ['J6reviewer6m 22s', '#011 Cart badge countBash bun run verify', 'Reviewing', '30 / 80', '96,700'],
  ]],
  ['Invoice Service3 / 5agents2 wait on you', [
    ['J11builder21m 15s', '#033 PDF footer totalsEdit src/pdf/FooterTotals.ts', 'Building', '77 / 120', '141,800'],
    ['J12builder34m 02s', '#034 Credit note numberingBash bun test ./src/features/credit-notes', 'Buildingquiet · 4 sweeps', '58 / 120', '122,300'],
    ['J14reviewer8m 51s', '#032 VAT rounding rulesRead src/vat/Rounding.ts', 'Reviewing', '19 / 80', '64,000'],
  ]],
  ['Research Wiki1 / 3agents1 waits on you', [
    ['J2builder16m 30s', '#007 Citation importerEdit src/import/Citations.ts', 'Building', '49 / 120', '103,490'],
  ]],
  ['Example Mobile App2 / 2agentsLaunches held', [
    ['J5builder41m 12s', '#021 Offline queueBash bun run verify', 'Building', '88 / 120', '97,200'],
    ['J7reviewer5m 03s', '#020 Push permission promptRead src/push/Permission.ts', 'Reviewing', '12 / 80', '41,300'],
  ]],
];

const FORGE_SENDS_NOTE = 'Gaia shows what the forge reports. Messages and stops are sent from the agent\'s own forge.';

type InputOverrides = Partial<Omit<AgentsModelInput, 'fleetDocument'>>;

function unfoldedView(fleetDocument: FleetDocument, overrides: InputOverrides = {}, onFiltersChange: (filters: AgentFilters) => void = () => undefined) {
  const content = AgentsModel.agentsContentOf({
    fleetDocument,
    selectedAgent:      null,
    query:              '',
    readAtMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT),
    ...overrides,
  });
  return tree.unfolded(<AgentsView content={content} onFiltersChange={onFiltersChange} />);
}

function bodyRowsIn(nodes: ReturnType<typeof unfoldedView>): HostElement[] {
  return tree.hostElementsIn(nodes, (element) => element.props['role'] === 'row' && element.props['data-head'] === undefined && !tree.hasClass(element, 'gaia-agents-group-head'));
}

function groupsIn(nodes: ReturnType<typeof unfoldedView>): HostElement[] {
  return tree.hostElementsIn(nodes, (element) => element.props['role'] === 'rowgroup');
}

function groupHeadTextOf(group: HostElement): string {
  return tree.textOf([tree.onlyHostElementIn([group], (element) => element.props['role'] === 'rowheader')]);
}

function cellTextsOf(row: HostElement): string[] {
  return tree.hostElementsIn([row], (element) => element.props['role'] === 'cell').map((cell) => tree.textOf([cell]));
}

function cellsOf(row: HostElement): HostElement[] {
  return tree.hostElementsIn([row], (element) => element.props['role'] === 'cell');
}

function panelIn(nodes: ReturnType<typeof unfoldedView>): HostElement {
  return tree.onlyWithClass(nodes, 'gaia-agents-panel');
}

function segmentNamed(nodes: ReturnType<typeof unfoldedView>, groupLabel: string, segmentLabel: string): HostElement {
  const label = tree.onlyHostElementIn(nodes, (element) => typeof element.props['id'] === 'string' && tree.textOf([element]) === groupLabel);
  const group = tree.onlyHostElementIn(nodes, (element) => element.props['role'] === 'group' && element.props['aria-labelledby'] === label.props['id']);
  return tree.onlyHostElementIn(group.children, (element) => element.tag === 'button' && tree.textOf([element]).startsWith(segmentLabel));
}

describe('the table', () => {
  test('with fleet-five-forges the table holds A2\'s ten rows, cell for cell, under their forges\' heads', () => {
    const view = unfoldedView(FLEET_FIVE_FORGES);
    expect(tree.hostElementsIn(view, (element) => element.props['role'] === 'columnheader').map((head) => tree.textOf([head]))).toEqual([
      'Job', 'Ticket · last tool', 'State', 'Calls', 'Tokens',
    ]);
    expect(groupsIn(view).map((group) => [groupHeadTextOf(group), bodyRowsIn([group]).map(cellTextsOf)])).toEqual(ARTBOARD_GROUPS);
    expect(bodyRowsIn(view)).toHaveLength(10);
  });

  test('each forge\'s head names it and meters its agents against its limit', () => {
    const [storefront] = groupsIn(unfoldedView(FLEET_FIVE_FORGES));
    expect(storefront?.props['aria-label']).toBe('Example Storefront');
    expect(tree.onlyWithClass([storefront as HostElement], 'design-system-slot-meter').props['aria-label']).toBe('4 agents against a limit of 5');
  });

  test('the filters show A2\'s counts, with All and Every agent pressed', () => {
    const view = unfoldedView(FLEET_FIVE_FORGES);
    const segments = tree.hostElementsIn(tree.hostElementsIn(view, tree.withClass('design-system-segments')), tree.withTag('button'));
    expect(segments.map((segment) => [tree.textOf([segment]), segment.props['aria-pressed']])).toEqual([
      ['All 10', true], ['Builders 7', false], ['Reviewers 3', false], ['Every agent', true], ['Needs a look 2', false],
    ]);
  });

  test('"Needs a look" leaves exactly the row that asks User and the quiet one', () => {
    const view = unfoldedView(FLEET_FIVE_FORGES, { query: 'condition=needs-a-look' });
    expect(groupsIn(view).map((group) => [group.props['aria-label'], bodyRowsIn([group]).map((row) => tree.textOf([tree.onlyWithClass([row], 'gaia-agents-job')]))])).toEqual([
      ['Example Storefront', ['J3']], ['Invoice Service', ['J12']],
    ]);
    expect(segmentNamed(view, 'Condition', 'Needs a look').props['aria-pressed']).toBe(true);
  });

  test('the Calls cell holds a meter beside a budget, and none at all when the forge reports no budget', () => {
    const withBudget = bodyRowsIn(unfoldedView(FLEET_FIVE_FORGES))[5] as HostElement;
    const callsWithBudget = cellsOf(withBudget)[3] as HostElement;
    expect(tree.onlyWithClass([callsWithBudget], 'design-system-fill-meter').props['aria-label']).toBe('58 of 120 calls');
    const withoutBudgets = { ...FLEET_FIVE_FORGES, agents: FLEET_FIVE_FORGES.agents.map((row) => ({ ...row, callBudget: null })) };
    const callsWithoutBudget = cellsOf(bodyRowsIn(unfoldedView(withoutBudgets))[5] as HostElement)[3] as HostElement;
    expect(tree.hostElementsIn([callsWithoutBudget], tree.withClass('design-system-fill-meter'))).toEqual([]);
    expect(tree.textOf([callsWithoutBudget])).toBe('58');
  });

  test('a counts-only forge\'s row shows id, role, tickets, state and tokens, and a dash in every other place', () => {
    const wikiGroup = groupsIn(unfoldedView(FLEET_DEGRADED)).find((group) => group.props['aria-label'] === 'Research Wiki') as HostElement;
    expect(bodyRowsIn([wikiGroup]).map(cellTextsOf)).toEqual([['J2builder—', '#007—', 'Building', '—', '103,490']]);
  });

  test('a row selects itself, named by its forge and job, and its job opens the agent in its forge', () => {
    const row = bodyRowsIn(unfoldedView(FLEET_FIVE_FORGES))[5] as HostElement;
    const links = tree.hostElementsIn([row], tree.withTag('a'));
    expect(links.map((link) => [link.props['className'], link.props['href']])).toEqual([
      ['gaia-agents-select', `#agents/${TRACKER_IDS.invoiceService}/J12`],
      ['gaia-agents-job', `#forge/${TRACKER_IDS.invoiceService}/#agents/J12`],
    ]);
  });

  test('filters that leave no row say so in the table\'s place', () => {
    const view = unfoldedView(FLEET_FIVE_FORGES, { query: 'role=reviewers&condition=needs-a-look' });
    expect(tree.hostElementsIn(view, tree.withClass('gaia-agents-table'))).toEqual([]);
    expect(tree.textOf([tree.onlyWithClass(view, 'gaia-agents-no-match')])).toBe('No agent matches these filters.');
  });
});

describe('a filter press', () => {
  test('pressing a segment hands the caller the filters with that segment chosen and the other filter kept', () => {
    const chosen: AgentFilters[] = [];
    const view = unfoldedView(FLEET_FIVE_FORGES, { query: 'role=builders' }, (filters) => chosen.push(filters));
    tree.dispatch(segmentNamed(view, 'Condition', 'Needs a look'), 'onClick');
    tree.dispatch(segmentNamed(view, 'Role', 'All'), 'onClick');
    expect(chosen).toEqual([{ role: 'builders', condition: 'needs-a-look' }, { role: 'all', condition: 'every-agent' }]);
  });
});

describe('the selected agent', () => {
  test('the selected row is marked current and the panel shows A2\'s facts, last line and way to the forge', () => {
    const view = unfoldedView(FLEET_FIVE_FORGES, { selectedAgent: J12_OF_INVOICE_SERVICE });
    const marked = bodyRowsIn(view).filter((row) => row.props['aria-current'] === 'true');
    expect(marked.map((row) => tree.onlyWithClass([row], 'gaia-agents-select').props['aria-label'])).toEqual(['Invoice Service, J12']);
    const panel = panelIn(view);
    expect(panel.props['aria-label']).toBe('Selected agent');
    expect(tree.textOf([tree.onlyWithClass([panel], 'gaia-agents-panel-head')])).toBe('JobJ12Building · 34m 02s');
    expect(tree.textOf([tree.onlyWithClass([panel], 'gaia-agents-panel-subject')])).toBe('builderInvoice Servicequiet · 4 sweeps');
    expect(tree.textOf([tree.onlyWithClass([panel], 'gaia-agents-panel-ticket')])).toBe('#034Credit note numbering');
    expect(tree.textOf([tree.onlyWithClass([panel], 'gaia-agents-panel-calls')])).toBe('58 / 120calls · 122,300 tokens');
    expect(tree.textOf([tree.onlyWithClass([panel], 'gaia-agents-panel-last-tool')])).toBe('Last tool Bash bun test ./src/features/credit-notes');
    expect(tree.textOf([tree.onlyWithTag([panel], 'dl')])).toBe('TurnMid-turnCalls58 of 120Tool calls143Subagents1 runningMessages waiting0');
    expect(tree.textOf([tree.onlyWithClass([panel], 'gaia-agents-panel-last-line')])).toBe(
      'Running the numbering specs again after the change to CreditNoteSequence.ts.\n$ bun test ./src/features/credit-notes',
    );
    const openLink = tree.onlyHostElementIn([panel], tree.withClass('design-system-button'));
    expect([openLink.tag, tree.textOf([openLink]), openLink.props['href']]).toEqual(['a', 'Open J12 in its forge', `#forge/${TRACKER_IDS.invoiceService}/#agents/J12`]);
  });

  test('the selected row survives a new document', () => {
    const nextDocument = { ...FLEET_FIVE_FORGES, agents: FLEET_FIVE_FORGES.agents.map((row) => ({ ...row, tokens: row.tokens + 100 })) };
    const view = unfoldedView(nextDocument, { selectedAgent: J12_OF_INVOICE_SERVICE });
    const marked = bodyRowsIn(view).filter((row) => row.props['aria-current'] === 'true');
    expect(marked.map((row) => cellTextsOf(row)[4])).toEqual(['122,400']);
    expect(tree.textOf([panelIn(view)])).toContain('Open J12 in its forge');
  });

  test('when the selected agent\'s job ends the panel says "This agent is no longer running."', () => {
    const ended = { ...FLEET_FIVE_FORGES, agents: FLEET_FIVE_FORGES.agents.filter((row) => !(row.trackerId === TRACKER_IDS.invoiceService && row.jobId === 'J12')) };
    const view = unfoldedView(ended, { selectedAgent: J12_OF_INVOICE_SERVICE });
    expect(bodyRowsIn(view).filter((row) => row.props['aria-current'] === 'true')).toEqual([]);
    expect(tree.textOf([tree.onlyWithClass([panelIn(view)], 'gaia-agents-panel-sentence')])).toBe('This agent is no longer running.');
  });

  test('with no agent selected the panel asks for one', () => {
    const panel = panelIn(unfoldedView(FLEET_FIVE_FORGES));
    expect(tree.textOf([tree.onlyWithClass([panel], 'gaia-agents-panel-sentence')])).toBe('Select an agent to see what its forge reports of it.');
  });

  test('a counts-only agent\'s panel says its last line is not reported, in words rather than as a machine value', () => {
    const panel = panelIn(unfoldedView(FLEET_DEGRADED, { selectedAgent: { trackerId: TRACKER_IDS.researchWiki, jobId: 'J2' } }));
    const lastLine = tree.onlyWithClass([panel], 'gaia-agents-panel-last-line');
    expect([lastLine.props['data-reported'], tree.textOf([lastLine])]).toEqual(['no', 'The forge reports no last line for this agent.']);
  });
});

describe('Gaia messages and stops no agent', () => {
  test('in every state the panel says messages and stops are sent from the agent\'s own forge', () => {
    const states = [
      unfoldedView(FLEET_FIVE_FORGES),
      unfoldedView(FLEET_FIVE_FORGES, { selectedAgent: J12_OF_INVOICE_SERVICE }),
      unfoldedView(FLEET_FIVE_FORGES, { selectedAgent: { trackerId: TRACKER_IDS.invoiceService, jobId: 'J99' } }),
    ];
    expect(states.map((view) => tree.textOf([tree.onlyWithClass([panelIn(view)], 'gaia-agents-panel-note')]))).toEqual([FORGE_SENDS_NOTE, FORGE_SENDS_NOTE, FORGE_SENDS_NOTE]);
  });

  test('the view\'s only buttons are the filters; everything else is a link', () => {
    const view = unfoldedView(FLEET_FIVE_FORGES, { selectedAgent: J12_OF_INVOICE_SERVICE });
    const buttons = tree.hostElementsIn(view, tree.withTag('button'));
    const segments = tree.hostElementsIn(tree.hostElementsIn(view, tree.withClass('design-system-segments')), tree.withTag('button'));
    expect(buttons).toEqual(segments);
    expect(buttons).toHaveLength(5);
  });
});

describe('no agent', () => {
  test('with fleet-empty the view says no agent runs, shows the machine with no limit known, and draws no table or filter', () => {
    const view = unfoldedView(FLEET_EMPTY);
    expect(tree.textOf([tree.onlyWithClass(view, 'gaia-agents-empty-sentence')])).toBe('No agents are running.');
    expect(tree.textOf([tree.onlyWithClass(view, 'gaia-agents-machine')])).toBe('This machine0agentsno limit known · 12 CPUs');
    expect(tree.hostElementsIn(view, (element) => tree.hasClass(element, 'gaia-agents-table') || tree.hasClass(element, 'design-system-segments'))).toEqual([]);
  });

  test('with a known limit the machine meter shows beside the sentence', () => {
    const idle = {
      ...FLEET_FIVE_FORGES,
      agents:  [],
      figures: { ...FLEET_FIVE_FORGES.figures, agentsInFlight: 0 },
    };
    const machine = tree.onlyWithClass(unfoldedView(idle), 'gaia-agents-machine');
    expect(tree.onlyWithClass([machine], 'design-system-fill-meter').props['aria-label']).toBe('0 of 12 agents');
    expect(tree.textOf([machine])).toBe('This machine0 / 12agentslimit 12 of 12 CPUs · Flint\'s brain runs outside it');
  });

  test('when the last agent ends while it is selected, the panel says it is no longer running under the sentence', () => {
    const view = unfoldedView({ ...FLEET_EMPTY, forges: FLEET_FIVE_FORGES.forges }, { selectedAgent: J12_OF_INVOICE_SERVICE });
    expect(tree.textOf([tree.onlyWithClass([panelIn(view)], 'gaia-agents-panel-sentence')])).toBe('This agent is no longer running.');
  });
});
