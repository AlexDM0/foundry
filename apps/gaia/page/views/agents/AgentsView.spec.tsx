/**
 * The Agents view's markup (SCREENS A2), unfolded without a document. What matters: with `fleet-five-forges` the table holds A2's ten rows
 * cell for cell under their forges' heads; "Needs a look" leaves the two rows the forge flags; the Calls cell holds no meter when there is
 * no budget; a `counts-only` forge's row shows a dash where its summary is silent; the selected row is marked and its panel survives a new
 * document or says the agent is no longer running; with no agent the view says so beside the machine meter; a filter press hands the
 * view's caller the new filters; and the view holds no control that would message or stop a job, and says so. Flint's brain (R4.5): its
 * row is last in its forge's group and selects itself without a job link; Stop and Wake each send their command for that forge only, and
 * neither exists where the forge does not serve them or on a held forge; its panel shows what SCREENS A2 lists; and a refused brain command
 * stays under its forge's head until dismissed.
 */
import { describe, expect, test } from 'bun:test';
import { ConfirmStrip }           from 'design-system/ConfirmStrip';
import { EmptyState }             from 'design-system/EmptyState';
import { FactList }               from 'design-system/FactList';
import { FillMeter }              from 'design-system/FillMeter';
import { ModelEffortMeter }       from 'design-system/ModelEffortMeter';
import { SegmentedControl }       from 'design-system/SegmentedControl';
import { SlotMeter }              from 'design-system/SlotMeter';
import type { ReactNode }         from 'react';

import type { ForgeCommandBody }                                                    from '../../@types/CommandDocument.ts';
import type { FleetDocument }                                                       from '../../@types/FleetDocument.ts';
import type { CommandStates, CommandSubject }                                       from '../../api/CommandSender.ts';
import { FailedActions }                                                            from '../../testing/FailedActions.ts';
import { PackageButtons }                                                           from '../../testing/PackageButtons.ts';
import { PackageControls }                                                          from '../../testing/PackageControls.ts';
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

const NO_COMMAND_STATES: CommandStates = { forges: new Map(), fleet: new Map() };

const IGNORED_BRAIN_HANDLERS = { onBrainCommand: () => undefined, onDismissFailure: () => undefined };

const STOREFRONT_BRAIN = { trackerId: TRACKER_IDS.exampleStorefront, jobId: 'flint-brain' };

/** Every forge at a control contract Gaia does not send, so none is sent a command. */
function atAnUnknownControlContract(fleetDocument: FleetDocument): FleetDocument {
  return { ...fleetDocument, forges: fleetDocument.forges.map((forge) => ({ ...forge, contracts: { ...forge.contracts, control: 3 } })) };
}

/** The view unfolded with every brain command and dismissal it hands on kept, in order. */
function viewSending(fleetDocument: FleetDocument, overrides: InputOverrides = {}) {
  const sent: ForgeCommandBody[] = [];
  const dismissed: CommandSubject[] = [];
  const content = AgentsModel.agentsContentOf({
    fleetDocument,
    selectedAgent:      null,
    query:              '',
    readAtMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT),
    timeZone:           'UTC',
    commandStates:      NO_COMMAND_STATES,
    ...overrides,
  });
  const handlers = {
    onFiltersChange:  () => undefined,
    onBrainCommand:   (command: ForgeCommandBody) => sent.push(command),
    onDismissFailure: (subject: CommandSubject) => dismissed.push(subject),
  };
  return { view: tree.unfolded(<AgentsView content={content} handlers={handlers} />), sent, dismissed };
}

function buttonNamed(nodes: ReturnType<typeof unfoldedView>, accessibleName: string): HostElement {
  return tree.onlyHostElementIn(nodes, (element) => PackageButtons.isButton(element) && PackageButtons.nameOf(element) === accessibleName);
}

/** What a press acts on rather than follows: a host button, or a package part handed a handler and no link. */
function pressablesIn(nodes: ReturnType<typeof unfoldedView>): HostElement[] {
  return tree.hostElementsIn(nodes, (element) => element.tag === 'button' || (PackageControls.isControl(element) && element.props['href'] === undefined));
}

/** Each fact Gaia hands the package's fact list, by its label and the words of its value. */
function factsOf(nodes: ReturnType<typeof unfoldedView>): (readonly [string, string])[] {
  const facts = tree.onlyOfComponent(nodes, FactList).props['facts'] as readonly { readonly label: string; readonly value: ReactNode }[];
  return facts.map((fact) => [fact.label, tree.readingOf(tree.unfolded(fact.value))]);
}

/**
 * A2's groups as the artboard's example data writes them (designs/Agents.dc.html): each forge's head, then its rows, the forges in the
 * registry's order and the jobs in the document's, and Example Storefront's running brain last under its jobs. Each row is its cells'
 * reading: job with its role and running time, ticket with its last tool call, state with its flag, calls, tokens, each package part in it
 * written as `[Name words]`. Example Mobile App's limit is the fixture's 2, where the artboard draws 4; a live forge whose brain is off
 * offers Wake on its head, and the running brain its Stop. Retake it from the artboard's script when the artboard changes.
 */
const ARTBOARD_GROUPS = [
  ['Example Storefront[SlotMeter 4 agents against a limit of 5]4 / 5agents+ brain2 wait on you', [
    ['J2builder12m 04s', '[MonoId #012] Checkout address formEdit src/checkout/AddressForm.tsx', 'Building', '[FillMeter 41 of 120 calls]41 / 120', '84,210'],
    ['J3builder9m 40s', '[MonoId #014] Password reset flowBash forge ask', 'Waiting[Tag asks you · E2]', '[FillMeter 22 of 120 calls]22 / 120', '51,900'],
    ['J4builder3m 10s', '[MonoId #013] Product image zoomRead src/product/Gallery.tsx', 'Building', '[FillMeter 9 of 120 calls]9 / 120', '18,400'],
    ['J6reviewer6m 22s', '[MonoId #011] Cart badge countBash bun run verify', 'Reviewing', '[FillMeter 30 of 80 calls]30 / 80', '96,700'],
    ['Flint\'s brainbrain0:36', 'outside the limitvisit Agents · wave[Button Stop]', 'Running1:24 left', 'haiku · low9 calls', '3.1k'],
  ]],
  ['Invoice Service[SlotMeter 3 agents against a limit of 5]3 / 5agents[Button Wake Flint\'s brain]2 wait on you', [
    ['J11builder21m 15s', '[MonoId #033] PDF footer totalsEdit src/pdf/FooterTotals.ts', 'Building', '[FillMeter 77 of 120 calls]77 / 120', '141,800'],
    [
      'J12builder34m 02s',
      '[MonoId #034] Credit note numberingBash bun test ./src/features/credit-notes',
      'Building[Tag quiet · 4 sweeps]',
      '[FillMeter 58 of 120 calls]58 / 120',
      '122,300',
    ],
    ['J14reviewer8m 51s', '[MonoId #032] VAT rounding rulesRead src/vat/Rounding.ts', 'Reviewing', '[FillMeter 19 of 80 calls]19 / 80', '64,000'],
  ]],
  ['Research Wiki[SlotMeter 1 agent against a limit of 3]1 / 3agents[Button Wake Flint\'s brain]1 waits on you', [
    ['J2builder16m 30s', '[MonoId #007] Citation importerEdit src/import/Citations.ts', 'Building', '[FillMeter 49 of 120 calls]49 / 120', '103,490'],
  ]],
  ['Example Mobile App[SlotMeter 2 agents against a limit of 2]2 / 2agentsLaunches held', [
    ['J5builder41m 12s', '[MonoId #021] Offline queueBash bun run verify', 'Building', '[FillMeter 88 of 120 calls]88 / 120', '97,200'],
    ['J7reviewer5m 03s', '[MonoId #020] Push permission promptRead src/push/Permission.ts', 'Reviewing', '[FillMeter 12 of 80 calls]12 / 80', '41,300'],
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
    timeZone:           'UTC',
    commandStates:      NO_COMMAND_STATES,
    ...overrides,
  });
  return tree.unfolded(<AgentsView content={content} handlers={{ ...IGNORED_BRAIN_HANDLERS, onFiltersChange }} />);
}

function bodyRowsIn(nodes: ReturnType<typeof unfoldedView>): HostElement[] {
  return tree.hostElementsIn(nodes, (element) => element.props['role'] === 'row' && element.props['data-head'] === undefined && !tree.hasClass(element, 'gaia-agents-group-head'));
}

function groupsIn(nodes: ReturnType<typeof unfoldedView>): HostElement[] {
  return tree.hostElementsIn(nodes, (element) => element.props['role'] === 'rowgroup');
}

function groupHeadTextOf(group: HostElement): string {
  return tree.readingOf([tree.onlyHostElementIn([group], (element) => element.props['role'] === 'rowheader')]);
}

function cellTextsOf(row: HostElement): string[] {
  return tree.hostElementsIn([row], (element) => element.props['role'] === 'cell').map((cell) => tree.readingOf([cell]));
}

/** A body row by its select link's name, such as "Invoice Service, J12". */
function jobRowNamed(nodes: ReturnType<typeof unfoldedView>, selectLabel: string): HostElement {
  const rows = bodyRowsIn(nodes).filter((row) => tree.hostElementsIn([row], (element) => element.props['aria-label'] === selectLabel).length > 0);
  const [row] = rows;
  if (rows.length !== 1 || row === undefined) throw new Error(`Expected one row named ${selectLabel}, found ${rows.length}.`);
  return row;
}

function cellsOf(row: HostElement): HostElement[] {
  return tree.hostElementsIn([row], (element) => element.props['role'] === 'cell');
}

function panelIn(nodes: ReturnType<typeof unfoldedView>): HostElement {
  return tree.onlyWithClass(nodes, 'gaia-agents-panel');
}

interface HandedSegment {
  readonly value:  string;
  readonly label:  string;
  readonly count?: number;
}

/** The package's segmented control Gaia names by the label element it hands it, and the segment of it with this label. */
function segmentNamed(nodes: ReturnType<typeof unfoldedView>, groupLabel: string, segmentLabel: string) {
  const label = tree.onlyHostElementIn(nodes, (element) => typeof element.props['id'] === 'string' && tree.textOf([element]) === groupLabel);
  const group = tree.onlyHostElementIn(nodes, (element) => tree.withComponent(SegmentedControl)(element) && element.props['labelledBy'] === label.props['id']);
  const segment = (group.props['options'] as readonly HandedSegment[]).find((option) => option.label === segmentLabel);
  if (segment === undefined) throw new Error(`The segment ${segmentLabel} is missing.`);
  return {
    isSelected: group.props['selected'] === segment.value,
    press:      () => tree.dispatch(group, 'onSelect', segment.value),
  };
}

/** Every segment of every segmented control, by its label, its count where it has one, and whether it is the selected one. */
function segmentsIn(nodes: ReturnType<typeof unfoldedView>): (readonly [string, number | null, boolean])[] {
  return tree.hostElementsIn(nodes, tree.withComponent(SegmentedControl)).flatMap((group) => (group.props['options'] as readonly HandedSegment[])
    .map((option) => [option.label, option.count ?? null, option.value === group.props['selected']] as const));
}

describe('the table', () => {
  test('with fleet-five-forges the table holds A2\'s ten rows and the brain\'s, cell for cell, under their forges\' heads', () => {
    const view = unfoldedView(FLEET_FIVE_FORGES);
    expect(tree.hostElementsIn(view, (element) => element.props['role'] === 'columnheader').map((head) => tree.readingOf([head]))).toEqual([
      'Job', 'Ticket · last tool', 'State', 'Calls', 'Tokens',
    ]);
    expect(groupsIn(view).map((group) => [groupHeadTextOf(group), bodyRowsIn([group]).map(cellTextsOf)])).toEqual(ARTBOARD_GROUPS);
    expect(bodyRowsIn(view)).toHaveLength(11);
  });

  test('each forge\'s head names it and meters its agents against its limit', () => {
    const [storefront] = groupsIn(unfoldedView(FLEET_FIVE_FORGES));
    expect(storefront?.props['aria-label']).toBe('Example Storefront');
    const meter = tree.onlyOfComponent([storefront as HostElement], SlotMeter);
    expect([meter.props['label'], meter.props['filled'], meter.props['limit']]).toEqual(['4 agents against a limit of 5', 4, 5]);
  });

  test('the filters show A2\'s counts, with All and Every agent pressed', () => {
    const view = unfoldedView(FLEET_FIVE_FORGES);
    expect(segmentsIn(view)).toEqual([
      ['All', 11, true], ['Builders', 7, false], ['Reviewers', 3, false], ['Flint\'s brain', 1, false], ['Every agent', null, true], ['Needs a look', 2, false],
    ]);
  });

  test('"Needs a look" leaves exactly the row that asks User and the quiet one', () => {
    const view = unfoldedView(FLEET_FIVE_FORGES, { query: 'condition=needs-a-look' });
    expect(groupsIn(view).map((group) => [group.props['aria-label'], bodyRowsIn([group]).map((row) => tree.readingOf([tree.onlyWithClass([row], 'gaia-agents-job')]))])).toEqual([
      ['Example Storefront', ['J3']], ['Invoice Service', ['J12']],
    ]);
    expect(segmentNamed(view, 'Condition', 'Needs a look').isSelected).toBe(true);
  });

  test('the Calls cell holds a borderless meter beside a budget, and none at all when the forge reports no budget', () => {
    const withBudget = jobRowNamed(unfoldedView(FLEET_FIVE_FORGES), 'Invoice Service, J12');
    const callsWithBudget = cellsOf(withBudget)[3] as HostElement;
    const meter = tree.onlyOfComponent([callsWithBudget], FillMeter);
    expect([meter.props['label'], meter.props['borderless']]).toEqual(['58 of 120 calls', true]);
    const withoutBudgets = { ...FLEET_FIVE_FORGES, agents: FLEET_FIVE_FORGES.agents.map((row) => ({ ...row, callBudget: null })) };
    const callsWithoutBudget = cellsOf(jobRowNamed(unfoldedView(withoutBudgets), 'Invoice Service, J12'))[3] as HostElement;
    expect(tree.hostElementsIn([callsWithoutBudget], tree.withComponent(FillMeter))).toEqual([]);
    expect(tree.readingOf([callsWithoutBudget])).toBe('58');
  });

  test('a counts-only forge\'s row shows id, role, tickets, state and tokens, and a dash in every other place', () => {
    const wikiGroup = groupsIn(unfoldedView(FLEET_DEGRADED)).find((group) => group.props['aria-label'] === 'Research Wiki') as HostElement;
    expect(bodyRowsIn([wikiGroup]).map(cellTextsOf)).toEqual([['J2builder—', '[MonoId #007]—', 'Building', '—', '103,490']]);
  });

  test('a row selects itself, named by its forge and job, and its job opens the agent in its forge', () => {
    const row = jobRowNamed(unfoldedView(FLEET_FIVE_FORGES), 'Invoice Service, J12');
    const links = tree.hostElementsIn([row], tree.withTag('a'));
    expect(links.map((link) => [link.props['className'], link.props['href']])).toEqual([
      ['gaia-agents-select', `#agents/${TRACKER_IDS.invoiceService}/J12`],
      ['gaia-agents-job', `#forge/${TRACKER_IDS.invoiceService}/agents/J12`],
    ]);
  });

  test('filters that leave no row say so in the table\'s place', () => {
    const view = unfoldedView(FLEET_FIVE_FORGES, { query: 'role=reviewers&condition=needs-a-look' });
    expect(tree.hostElementsIn(view, tree.withClass('gaia-agents-table'))).toEqual([]);
    expect(tree.onlyOfComponent(view, EmptyState).props['text']).toBe('No agent matches these filters.');
  });
});

describe('a filter press', () => {
  test('pressing a segment hands the caller the filters with that segment chosen and the other filter kept', () => {
    const chosen: AgentFilters[] = [];
    const view = unfoldedView(FLEET_FIVE_FORGES, { query: 'role=builders' }, (filters) => chosen.push(filters));
    segmentNamed(view, 'Condition', 'Needs a look').press();
    segmentNamed(view, 'Role', 'All').press();
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
    expect(tree.readingOf([tree.onlyWithClass([panel], 'gaia-agents-panel-head')])).toBe('Job[MonoId J12]Building · 34m 02s');
    expect(tree.readingOf([tree.onlyWithClass([panel], 'gaia-agents-panel-subject')])).toBe('builderInvoice Service[Tag quiet · 4 sweeps]');
    expect(tree.readingOf([tree.onlyWithClass([panel], 'gaia-agents-panel-ticket')])).toBe('[MonoId #034]Credit note numbering');
    expect(tree.readingOf([tree.onlyWithClass([panel], 'gaia-agents-panel-calls')])).toBe('[FillMeter 58 of 120 calls]58 / 120calls · 122,300 tokens');
    expect(tree.readingOf([tree.onlyWithClass([panel], 'gaia-agents-panel-last-tool')])).toBe('Last tool Bash bun test ./src/features/credit-notes');
    expect(factsOf([panel])).toEqual([['Turn', 'Mid-turn'], ['Calls', '58 of 120'], ['Tool calls', '143'], ['Subagents', '1 running'], ['Messages waiting', '0']]);
    expect(tree.readingOf([tree.onlyWithClass([panel], 'gaia-agents-panel-last-line')])).toBe(
      'Running the numbering specs again after the change to CreditNoteSequence.ts.\n$ bun test ./src/features/credit-notes',
    );
    const openLink = tree.onlyHostElementIn([panel], PackageButtons.isButton);
    expect([PackageButtons.labelOf(openLink), openLink.props['href']]).toEqual(['Open J12 in its forge', `#forge/${TRACKER_IDS.invoiceService}/agents/J12`]);
  });

  test('the selected row survives a new document', () => {
    const nextDocument = { ...FLEET_FIVE_FORGES, agents: FLEET_FIVE_FORGES.agents.map((row) => ({ ...row, tokens: row.tokens + 100 })) };
    const view = unfoldedView(nextDocument, { selectedAgent: J12_OF_INVOICE_SERVICE });
    const marked = bodyRowsIn(view).filter((row) => row.props['aria-current'] === 'true');
    expect(marked.map((row) => cellTextsOf(row)[4])).toEqual(['122,400']);
    expect(PackageButtons.buttonsIn([panelIn(view)]).map(PackageButtons.labelOf)).toEqual(['Open J12 in its forge']);
  });

  test('when the selected agent\'s job ends the panel says "This agent is no longer running."', () => {
    const ended = { ...FLEET_FIVE_FORGES, agents: FLEET_FIVE_FORGES.agents.filter((row) => !(row.trackerId === TRACKER_IDS.invoiceService && row.jobId === 'J12')) };
    const view = unfoldedView(ended, { selectedAgent: J12_OF_INVOICE_SERVICE });
    expect(bodyRowsIn(view).filter((row) => row.props['aria-current'] === 'true')).toEqual([]);
    expect(tree.readingOf([tree.onlyWithClass([panelIn(view)], 'gaia-agents-panel-sentence')])).toBe('This agent is no longer running.');
  });

  test('with no agent selected the panel asks for one', () => {
    const panel = panelIn(unfoldedView(FLEET_FIVE_FORGES));
    expect(tree.readingOf([tree.onlyWithClass([panel], 'gaia-agents-panel-sentence')])).toBe('Select an agent to see what its forge reports of it.');
  });

  test('a counts-only agent\'s panel says its last line is not reported, in words rather than as a machine value', () => {
    const panel = panelIn(unfoldedView(FLEET_DEGRADED, { selectedAgent: { trackerId: TRACKER_IDS.researchWiki, jobId: 'J2' } }));
    const lastLine = tree.onlyWithClass([panel], 'gaia-agents-panel-last-line');
    expect([lastLine.props['data-reported'], tree.readingOf([lastLine])]).toEqual(['no', 'The forge reports no last line for this agent.']);
  });
});

describe('Gaia messages and stops no agent', () => {
  test('in every state the panel says messages and stops are sent from the agent\'s own forge', () => {
    const states = [
      unfoldedView(FLEET_FIVE_FORGES),
      unfoldedView(FLEET_FIVE_FORGES, { selectedAgent: J12_OF_INVOICE_SERVICE }),
      unfoldedView(FLEET_FIVE_FORGES, { selectedAgent: { trackerId: TRACKER_IDS.invoiceService, jobId: 'J99' } }),
    ];
    expect(states.map((view) => tree.readingOf([tree.onlyWithClass([panelIn(view)], 'gaia-agents-panel-note')]))).toEqual([FORGE_SENDS_NOTE, FORGE_SENDS_NOTE, FORGE_SENDS_NOTE]);
  });

  test('where no forge serves the brain\'s commands, the view\'s only buttons are the filters; everything else is a link', () => {
    const view = unfoldedView(atAnUnknownControlContract(FLEET_FIVE_FORGES), { selectedAgent: J12_OF_INVOICE_SERVICE });
    expect(pressablesIn(view).map((pressable) => pressable.tag)).toEqual(['SegmentedControl', 'SegmentedControl']);
    expect(segmentsIn(view)).toHaveLength(6);
  });

  test('where the forges serve them, the only other buttons are the brain\'s Wake and Stop, and the selected job\'s panel holds none', () => {
    const view = unfoldedView(FLEET_FIVE_FORGES, { selectedAgent: J12_OF_INVOICE_SERVICE });
    const others = pressablesIn(view).filter((pressable) => !tree.withComponent(SegmentedControl)(pressable));
    expect(others.map(PackageControls.nameOf)).toEqual([
      'Stop Flint\'s brain on Example Storefront',
      'Wake Flint\'s brain on Invoice Service',
      'Wake Flint\'s brain on Research Wiki',
    ]);
    expect(pressablesIn([panelIn(view)])).toEqual([]);
  });
});

describe('no agent', () => {
  test('with fleet-empty the view says no agent runs, shows the machine with no limit known, and draws no table or filter', () => {
    const view = unfoldedView(FLEET_EMPTY);
    expect(tree.readingOf([tree.onlyWithClass(view, 'gaia-agents-empty-sentence')])).toBe('No agents are running.');
    expect(tree.readingOf([tree.onlyWithClass(view, 'gaia-agents-machine')]))
      .toBe('[MicroCapsLabel This machine]0agents[FillMeter 0 agents, no limit known]no limit known · 12 CPUs');
    expect(tree.hostElementsIn(view, (element) => tree.hasClass(element, 'gaia-agents-table') || tree.withComponent(SegmentedControl)(element))).toEqual([]);
  });

  test('with a known limit the machine meter shows beside the sentence', () => {
    const idle = {
      ...FLEET_FIVE_FORGES,
      agents:  [],
      figures: { ...FLEET_FIVE_FORGES.figures, agentsInFlight: 0 },
    };
    const machine = tree.onlyWithClass(unfoldedView(idle), 'gaia-agents-machine');
    expect(tree.onlyOfComponent([machine], FillMeter).props['label']).toBe('0 of 12 agents');
    expect(tree.readingOf([machine])).toBe('[MicroCapsLabel This machine]0 / 12agents[FillMeter 0 of 12 agents]limit 12 of 12 CPUs · Flint\'s brain runs outside it');
  });

  test('when the last agent ends while it is selected, the panel says it is no longer running under the sentence', () => {
    const view = unfoldedView({ ...FLEET_EMPTY, forges: FLEET_FIVE_FORGES.forges }, { selectedAgent: J12_OF_INVOICE_SERVICE });
    expect(tree.readingOf([tree.onlyWithClass([panelIn(view)], 'gaia-agents-panel-sentence')])).toBe('This agent is no longer running.');
  });
});

describe('Flint\'s brain', () => {
  test('its row selects itself, named by its forge, and its name is no link: it is not a job', () => {
    const row = jobRowNamed(unfoldedView(FLEET_FIVE_FORGES), 'Example Storefront, Flint\'s brain');
    expect(tree.hostElementsIn([row], tree.withTag('a')).map((link) => [link.props['className'], link.props['href']])).toEqual([
      ['gaia-agents-select', `#agents/${TRACKER_IDS.exampleStorefront}/flint-brain`],
    ]);
  });

  test('its Stop sends forge-brain-stop for its own forge only, without a question first', () => {
    const { view, sent } = viewSending(FLEET_FIVE_FORGES);
    PackageButtons.press(buttonNamed(view, 'Stop Flint\'s brain on Example Storefront'));
    expect(sent).toEqual([{ kind: 'forge-brain-stop', trackerId: TRACKER_IDS.exampleStorefront }]);
    expect(tree.hostElementsIn(view, tree.withComponent(ConfirmStrip))).toEqual([]);
  });

  test('Wake on a forge\'s head sends forge-brain-start for that forge only, and a held forge has none', () => {
    const { view, sent } = viewSending(FLEET_FIVE_FORGES);
    PackageButtons.press(buttonNamed(view, 'Wake Flint\'s brain on Invoice Service'));
    expect(sent).toEqual([{ kind: 'forge-brain-start', trackerId: TRACKER_IDS.invoiceService }]);
    const mobileApp = groupsIn(view).find((group) => group.props['aria-label'] === 'Example Mobile App') as HostElement;
    expect(pressablesIn([mobileApp])).toEqual([]);
  });

  test('Wake and Stop are absent where the forge does not serve the brain\'s commands', () => {
    const view = unfoldedView(atAnUnknownControlContract(FLEET_FIVE_FORGES));
    expect(PackageButtons.buttonsIn(view).filter((button) => /Flint's brain on/.test(PackageButtons.nameOf(button)))).toEqual([]);
    expect(tree.readingOf([tree.onlyWithClass(view, 'gaia-agents-group-brain-pill')])).toBe('+ brain');
  });

  test('the brain\'s panel sets the run it is allowed in the plain face and the machine figure apart, as parts of their lines', () => {
    const panel = panelIn(viewSending(FLEET_FIVE_FORGES, { selectedAgent: STOREFRONT_BRAIN }).view);
    expect(tree.hostElementsIn([tree.onlyWithClass([panel], 'gaia-agents-panel-brain-model')], tree.withClass('gaia-agents-panel-running'))).toEqual([]);
    const outsideLine = tree.onlyWithClass([panel], 'gaia-agents-panel-brain-outside');
    expect(outsideLine.children.filter((child) => typeof child === 'string')).toEqual(['Not counted in the ', ' machine limit']);
    expect(tree.readingOf([tree.onlyWithClass([outsideLine], 'gaia-agents-panel-running')])).toBe('10 / 12');
  });

  test('selecting it shows the brain\'s panel: its time left, model and effort, what the forge reports, its moves, Stop and the way to its forge', () => {
    const { view, sent } = viewSending(FLEET_FIVE_FORGES, { selectedAgent: STOREFRONT_BRAIN });
    const row = jobRowNamed(view, 'Example Storefront, Flint\'s brain');
    expect(row.props['aria-current']).toBe('true');
    const panel = panelIn(view);
    expect(tree.readingOf([tree.onlyWithClass([panel], 'gaia-agents-panel-head')])).toBe('Flint\'s brainRunning · 1:24 left');
    expect(tree.readingOf([tree.onlyWithClass([panel], 'gaia-agents-panel-subject')])).toBe('brainExample Storefront');
    const effortMeter = tree.onlyOfComponent([panel], ModelEffortMeter);
    expect([effortMeter.props['model'], effortMeter.props['effort']]).toEqual(['haiku', 'low']);
    expect(tree.readingOf([tree.onlyWithClass([panel], 'gaia-agents-panel-brain-model')])).toBe('· 2:00 at most');
    expect(factsOf([panel])).toEqual([
      ['Started', '13:18 from Gaia'], ['Ends', '13:20 at the latest'], ['Model, effort', 'haiku · low'], ['Tokens so far', '3.1k'], ['Calls so far', '9'],
    ]);
    expect(tree.readingOf([tree.onlyWithClass([panel], 'gaia-agents-panel-brain-outside')])).toBe('Not counted in the 10 / 12 machine limit');
    expect(tree.hostElementsIn([panel], tree.withClass('gaia-agents-panel-move')).map((move) => tree.readingOf([move]))).toEqual([
      '[Stamp 13:19:28]visit Agents · wave',
      '[Stamp 13:19:19]walk to Kanban · look at #013',
      '[Stamp 13:19:06]read the board · 4 jobs, 1 question',
      '[Stamp 13:18:58]wake · stretch',
    ]);
    expect(tree.readingOf([tree.onlyWithClass([panel], 'gaia-agents-panel-note')])).toBe('The brain ends by itself at 2:00. Stop asks the forge to end it now.');
    const open = tree.onlyHostElementIn([panel], (element) => PackageButtons.isButton(element) && element.props['href'] !== undefined);
    expect([PackageButtons.labelOf(open), open.props['href']]).toEqual(['Open in its forge', `#forge/${TRACKER_IDS.exampleStorefront}/agents`]);
    PackageButtons.press(tree.onlyHostElementIn(pressablesIn([panel]), PackageButtons.isButton));
    expect(sent).toEqual([{ kind: 'forge-brain-stop', trackerId: TRACKER_IDS.exampleStorefront }]);
  });

  test('once the forge drops the selected brain, the panel says it is no longer running and keeps the way to its forge', () => {
    const ended = { ...FLEET_FIVE_FORGES, agents: FLEET_FIVE_FORGES.agents.filter((row) => row.countsAgainstLimit) };
    const panel = panelIn(unfoldedView(ended, { selectedAgent: STOREFRONT_BRAIN }));
    expect(tree.readingOf([tree.onlyWithClass([panel], 'gaia-agents-panel-sentence')])).toBe('Flint\'s brain is no longer running.');
    expect(PackageButtons.labelOf(tree.onlyHostElementIn([panel], PackageButtons.isButton))).toBe('Open in its forge');
  });

  test('the note under the table says the brain is not one of the machine\'s agents only while one runs', () => {
    expect(tree.readingOf([tree.onlyWithClass(unfoldedView(FLEET_FIVE_FORGES), 'gaia-agents-footnote')])).toBe(
      'Flint\'s brain is not one of the 10 / 12 machine agents. Gaia shows what each forge reports.',
    );
    const withoutTheBrain = { ...FLEET_FIVE_FORGES, agents: FLEET_FIVE_FORGES.agents.filter((row) => row.countsAgainstLimit) };
    expect(tree.readingOf([tree.onlyWithClass(unfoldedView(withoutTheBrain), 'gaia-agents-footnote')])).toBe('Gaia shows what each forge reports.');
  });

  test('a brain running with no job anywhere still gets its forge\'s group, not the sentence that no agent runs', () => {
    const brainAlone = {
      ...FLEET_FIVE_FORGES,
      agents:  FLEET_FIVE_FORGES.agents.filter((row) => !row.countsAgainstLimit),
      figures: { ...FLEET_FIVE_FORGES.figures, agentsInFlight: 0 },
    };
    const view = unfoldedView(brainAlone);
    expect(tree.hostElementsIn(view, tree.withClass('gaia-agents-empty'))).toEqual([]);
    expect(groupsIn(view).map(groupHeadTextOf)).toEqual(['Example Storefront[SlotMeter 0 agents against a limit of 5]0 / 5agents+ brain2 wait on you']);
  });

  test('a refused brain command shows under its forge\'s head until dismissed, and its dismissal names that forge', () => {
    const commandStates: CommandStates = {
      forges: new Map([[TRACKER_IDS.invoiceService, {
        onItsWay: null,
        failure:  {
          kind:   'forge-brain-start',
          result: {
            verdict: 'answered',
            answer:  {
              answerVersion: 3, outcome: 'refused', refusal: 'no-flint', text: 'this forge has no Flint'
            }
          }
        },
        restartPending: false,
      }]]),
      fleet: new Map(),
    };
    const { view, dismissed } = viewSending(FLEET_FIVE_FORGES, { commandStates });
    const invoiceService = groupsIn(view).find((group) => group.props['aria-label'] === 'Invoice Service') as HostElement;
    const refusal = FailedActions.onlyFailedActionIn([invoiceService]);
    expect(FailedActions.wordsOf(refusal)).toEqual(['The forge refused Wake Flint\'s brain: ', 'no-flint', 'this forge has no Flint']);
    tree.dispatch(refusal, 'onDismiss');
    expect(dismissed).toEqual([{ trackerId: TRACKER_IDS.invoiceService }]);
  });
});
